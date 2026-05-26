// ============================================================
// Password Reset Routes — Request, Validate, Reset, HTML Page
// ============================================================
const express = require("express");
const crypto = require("crypto");
const { body } = require("express-validator");
const { adminDb, adminAuth } = require("../utils/firebaseAdmin");
const { hashPassword, hashData, decryptData } = require("../utils/encryption");
const { validateRequest } = require("../middleware/validate");
const { logEvent } = require("../utils/auditLogger");
const { sendPasswordResetEmail } = require("../utils/emailService");

const router = express.Router();

const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Generate a cryptographically secure reset token.
 * Returns { rawToken, tokenHash }
 */
function generateResetToken() {
    const rawToken = crypto.randomBytes(32).toString("hex"); // 64-char hex
    const tokenHash = hashData(rawToken); // SHA-256
    return { rawToken, tokenHash };
}

// ─── REQUEST PASSWORD RESET ─────────────────────────────
router.post(
    "/request",
    [
        body("email").isEmail().normalizeEmail().withMessage("Valid email is required"),
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { email } = req.body;

            // 1. Find user by email in RTDB (check email_hash or plain email)
            const emailHash = hashData(email.toLowerCase());
            let foundUserId = null;
            let foundUserName = null;

            const usersSnap = await adminDb.ref("users").once("value");
            const usersData = usersSnap.val();

            if (usersData) {
                for (const [uid, userData] of Object.entries(usersData)) {
                    // Check email_hash match
                    if (userData.email_hash && userData.email_hash === emailHash) {
                        foundUserId = uid;
                        foundUserName = userData.fullName ? decryptData(userData.fullName) : null;
                        break;
                    }
                    // Check plain email match (legacy / unencrypted)
                    if (userData.email && typeof userData.email === "string") {
                        const plainEmail = decryptData(userData.email);
                        if (plainEmail.toLowerCase() === email.toLowerCase()) {
                            foundUserId = uid;
                            foundUserName = userData.fullName ? decryptData(userData.fullName) : null;
                            break;
                        }
                    }
                }
            }

            // Also try Firebase Auth as fallback
            if (!foundUserId) {
                try {
                    const authUser = await adminAuth.getUserByEmail(email);
                    if (authUser) {
                        foundUserId = authUser.uid;
                        foundUserName = authUser.displayName || null;
                    }
                } catch (authErr) {
                    // User not found in Firebase Auth either
                }
            }

            if (!foundUserId) {
                await logEvent("FAILED_PASSWORD_RESET", null, { reason: "Email not found", email, ip: req.ip });
                return res.status(404).json({ error: "Your email is incorrect" });
            }

            // 2. Generate secure one-time token
            const { rawToken, tokenHash } = generateResetToken();
            const now = Date.now();

            // 3. Store token in Firebase RTDB
            await adminDb.ref(`passwordResetTokens/${tokenHash}`).set({
                userId: foundUserId,
                email: email.toLowerCase(),
                createdAt: new Date(now).toISOString(),
                expiresAt: new Date(now + TOKEN_EXPIRY_MS).toISOString(),
                expiresAtMs: now + TOKEN_EXPIRY_MS,
                used: false,
            });

            // 4. Build reset link (opens HTML page served by this backend)
            const backendHost = req.get("host");
            const protocol = req.protocol;
            const resetLink = `${protocol}://${backendHost}/api/password-reset/page/${rawToken}`;

            // 5. Send email
            const emailSent = await sendPasswordResetEmail(email, foundUserName || "User", resetLink);

            if (!emailSent) {
                await logEvent("EMAIL_SEND_FAILED", foundUserId, { email, ip: req.ip });
                return res.status(500).json({ error: "Failed to send reset email. Please try again." });
            }

            // 6. Log event
            await logEvent("PASSWORD_RESET_REQUESTED", foundUserId, { email, ip: req.ip });

            return res.json({
                success: true,
                message: "Password reset link sent to your email",
            });
        } catch (err) {
            console.error("[PasswordReset/Request] Error:", err);
            return res.status(500).json({ error: "Failed to process request. Please try again." });
        }
    }
);

// ─── VALIDATE TOKEN ─────────────────────────────────────
router.get("/validate/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const tokenHash = hashData(token);
        console.log(`[PasswordReset/Validate] Validating token: ${token.substring(0, 8)}... (hash: ${tokenHash.substring(0, 8)}...)`);

        const snap = await adminDb.ref(`passwordResetTokens/${tokenHash}`).once("value");
        const tokenData = snap.val();

        if (!tokenData) {
            console.log("[PasswordReset/Validate] Token not found in database.");
            return res.json({ valid: false, reason: "Link expired or already used" });
        }

        if (tokenData.used) {
            console.log("[PasswordReset/Validate] Token already marked as used.");
            return res.json({ valid: false, reason: "Link expired or already used" });
        }

        if (Date.now() > tokenData.expiresAtMs) {
            console.log("[PasswordReset/Validate] Token expired. Cleaning up.");
            // Clean up expired token
            await adminDb.ref(`passwordResetTokens/${tokenHash}`).remove();
            return res.json({ valid: false, reason: "Link expired or already used" });
        }

        console.log(`[PasswordReset/Validate] Token is valid for user: ${tokenData.userId}`);
        return res.json({ valid: true, email: tokenData.email });
    } catch (err) {
        console.error("[PasswordReset/Validate] Error:", err);
        return res.json({ valid: false, reason: "An error occurred" });
    }
});

// ─── RESET PASSWORD ─────────────────────────────────────
router.post(
    "/reset",
    [
        body("token").notEmpty().withMessage("Reset token is required"),
        body("newPassword").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { token, newPassword } = req.body;
            const tokenHash = hashData(token);
            console.log(`[PasswordReset/Reset] Received reset request for token: ${token.substring(0, 8)}... (hash: ${tokenHash.substring(0, 8)}...)`);

            // 1. Validate token
            const snap = await adminDb.ref(`passwordResetTokens/${tokenHash}`).once("value");
            const tokenData = snap.val();

            if (!tokenData) {
                console.log("[PasswordReset/Reset] Token not found in database.");
                return res.status(400).json({ error: "Link expired or already used" });
            }

            if (tokenData.used) {
                console.log("[PasswordReset/Reset] Token already marked as used.");
                return res.status(400).json({ error: "Link expired or already used" });
            }

            if (Date.now() > tokenData.expiresAtMs) {
                console.log("[PasswordReset/Reset] Token expired. Removing.");
                await adminDb.ref(`passwordResetTokens/${tokenHash}`).remove();
                return res.status(400).json({ error: "Link expired or already used" });
            }

            const userId = tokenData.userId;
            console.log(`[PasswordReset/Reset] Token is valid. User ID: ${userId}. Hashing password...`);

            // 2. Hash new password with bcrypt
            const hashedPassword = await hashPassword(newPassword);

            // 3. Update password in Firebase RTDB
            console.log(`[PasswordReset/Reset] Updating RTDB for users/${userId}...`);
            await adminDb.ref(`users/${userId}`).update({
                passwordHash: hashedPassword,
                passwordUpdatedAt: new Date().toISOString(),
            });
            console.log("[PasswordReset/Reset] RTDB successfully updated.");

            // 4. Update Firebase Auth password
            console.log(`[PasswordReset/Reset] Updating Firebase Auth for user: ${userId}...`);
            try {
                await adminAuth.updateUser(userId, { password: newPassword });
                console.log("[PasswordReset/Reset] Firebase Auth successfully updated.");
            } catch (authErr) {
                console.error("[PasswordReset/Reset] Firebase Auth update failed:", authErr.message);
                // Continue — RTDB hash is updated, which is the primary check
            }

            // 5. Mark token as used and remove it
            console.log(`[PasswordReset/Reset] Marking token as used...`);
            await adminDb.ref(`passwordResetTokens/${tokenHash}`).update({ used: true });
            
            // Clean up after a short delay
            setTimeout(async () => {
                try {
                    await adminDb.ref(`passwordResetTokens/${tokenHash}`).remove();
                    console.log(`[PasswordReset/Reset] Token ${tokenHash.substring(0, 8)}... cleaned up.`);
                } catch (cleanErr) {
                    console.error("[PasswordReset/Reset] Token cleanup failed:", cleanErr.message);
                }
            }, 5000);

            // 6. Invalidate all existing refresh tokens for this user
            try {
                await adminDb.ref(`refreshTokens/${userId}`).remove();
                console.log("[PasswordReset/Reset] Refresh tokens invalidated.");
            } catch (refErr) {
                console.error("[PasswordReset/Reset] Failed to remove refresh tokens:", refErr.message);
            }

            // 7. Log event
            await logEvent("PASSWORD_RESET_SUCCESS", userId, { email: tokenData.email, ip: req.ip });
            console.log(`[PasswordReset/Reset] Password reset flow successfully completed for ${tokenData.email}.`);

            return res.json({ success: true, message: "Password has been reset successfully" });
        } catch (err) {
            console.error("[PasswordReset/Reset] Error:", err);
            return res.status(500).json({ error: "Failed to reset password. Please try again." });
        }
    }
);

// ─── HTML RESET PAGE (served in browser) ────────────────
router.get("/page/:token", async (req, res) => {
    const { token } = req.params;
    const tokenHash = hashData(token);
    console.log(`[PasswordReset/Page] Reset page requested for token: ${token.substring(0, 8)}... (hash: ${tokenHash.substring(0, 8)}...)`);

    // Validate token first
    let valid = false;
    let reason = "";
    try {
        const snap = await adminDb.ref(`passwordResetTokens/${tokenHash}`).once("value");
        const tokenData = snap.val();
        if (!tokenData) {
            console.log("[PasswordReset/Page] Token not found in database.");
            reason = "Link expired or already used";
        } else if (tokenData.used) {
            console.log("[PasswordReset/Page] Token already marked as used.");
            reason = "Link expired or already used";
        } else if (Date.now() > tokenData.expiresAtMs) {
            console.log("[PasswordReset/Page] Token expired. Cleaning up.");
            reason = "Link expired or already used";
            await adminDb.ref(`passwordResetTokens/${tokenHash}`).remove();
        } else {
            console.log(`[PasswordReset/Page] Token is valid. Rendering HTML form for user ${tokenData.userId}...`);
            valid = true;
        }
    } catch (err) {
        console.error("[PasswordReset/Page] Error validating token:", err);
        reason = "An error occurred";
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Password — Digital Committee</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, #1a0a0a 0%, #2d0f0f 50%, #0d0d1a 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .card {
            background: rgba(30, 30, 45, 0.95);
            border: 1px solid rgba(128, 0, 0, 0.3);
            border-radius: 24px;
            padding: 40px 32px;
            max-width: 420px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            backdrop-filter: blur(20px);
        }
        .logo {
            text-align: center;
            margin-bottom: 24px;
        }
        .logo-icon {
            width: 64px; height: 64px;
            background: linear-gradient(135deg, #800000, #B22222);
            border-radius: 16px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            margin-bottom: 12px;
        }
        .logo h1 {
            color: #fff;
            font-size: 22px;
            font-weight: 800;
        }
        .logo p {
            color: #9ca3af;
            font-size: 14px;
            margin-top: 4px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            color: #d1d5db;
            font-weight: 600;
            font-size: 14px;
            margin-bottom: 8px;
        }
        .input-wrap {
            position: relative;
        }
        input[type="password"], input[type="text"] {
            width: 100%;
            padding: 14px 48px 14px 16px;
            border: 1.5px solid rgba(128, 0, 0, 0.4);
            border-radius: 12px;
            background: rgba(20, 20, 35, 0.8);
            color: #fff;
            font-size: 16px;
            outline: none;
            transition: border-color 0.2s;
        }
        input:focus {
            border-color: #B22222;
        }
        .toggle-btn {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: #9ca3af;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 4px;
        }
        .toggle-btn svg {
            display: block;
            width: 20px;
            height: 20px;
            pointer-events: none;
        }
        .submit-btn {
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, #800000, #B22222);
            color: #fff;
            border: none;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 700;
            cursor: pointer;
            transition: opacity 0.2s, transform 0.1s;
            margin-top: 8px;
        }
        .submit-btn:hover { opacity: 0.9; }
        .submit-btn:active { transform: scale(0.98); }
        .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .error-msg {
            color: #ef4444;
            font-size: 13px;
            margin-top: 6px;
            display: none;
        }
        .error-msg.visible { display: block; }
        .alert {
            padding: 16px;
            border-radius: 12px;
            text-align: center;
            margin-bottom: 20px;
        }
        .alert-error {
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #f87171;
        }
        .alert-success {
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid rgba(16, 185, 129, 0.3);
            color: #34d399;
        }
        .spinner {
            display: inline-block;
            width: 18px; height: 18px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top-color: #fff;
            border-radius: 50%;
            animation: spin 0.6s linear infinite;
            margin-right: 8px;
            vertical-align: middle;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .lock-icon { font-size: 14px; color: #6b7280; text-align: center; margin-top: 16px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">
            <div class="logo-icon">🔐</div>
            <h1>Digital Committee</h1>
            <p>Reset Your Password</p>
        </div>

        ${!valid ? `
            <div class="alert alert-error">
                <strong>⚠️ ${reason}</strong><br>
                <span style="font-size: 13px; margin-top: 8px; display: block;">
                    Please request a new password reset link from the app.
                </span>
            </div>
        ` : `
            <div id="form-container">
                <div id="alert-box" class="alert" style="display:none;"></div>

                <div class="form-group">
                    <label>New Password</label>
                    <div class="input-wrap">
                        <input type="password" id="newPassword" placeholder="Enter new password (min 8 chars)" />
                        <button class="toggle-btn" id="toggleNewPassword" type="button"></button>
                    </div>
                    <div class="error-msg" id="newPassword-error"></div>
                </div>

                <div class="form-group">
                    <label>Confirm Password</label>
                    <div class="input-wrap">
                        <input type="password" id="confirmPassword" placeholder="Confirm your password" />
                        <button class="toggle-btn" id="toggleConfirmPassword" type="button"></button>
                    </div>
                    <div class="error-msg" id="confirmPassword-error"></div>
                </div>

                <button class="submit-btn" id="submitBtn">
                    Save New Password
                </button>
            </div>

            <div id="success-container" style="display:none;">
                <div class="alert alert-success">
                    <strong>✅ Password Reset Successfully!</strong><br>
                    <span style="font-size: 13px; margin-top: 8px; display: block;">
                        You can now open the app and log in with your new password.
                    </span>
                </div>
            </div>

            <script>
                const TOKEN = "${token}";

                const EYE_OPEN = \`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>\`;
                const EYE_CLOSED = \`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>\`;

                // Bind programmatically after DOM content is loaded
                document.addEventListener('DOMContentLoaded', () => {
                    // Set default icons
                    document.getElementById('toggleNewPassword').innerHTML = EYE_CLOSED;
                    document.getElementById('toggleConfirmPassword').innerHTML = EYE_CLOSED;

                    document.getElementById('toggleNewPassword').addEventListener('click', function() {
                        togglePassword('newPassword', this);
                    });
                    
                    document.getElementById('toggleConfirmPassword').addEventListener('click', function() {
                        togglePassword('confirmPassword', this);
                    });

                    document.getElementById('submitBtn').addEventListener('click', handleSubmit);
                });

                function togglePassword(fieldId, btn) {
                    const field = document.getElementById(fieldId);
                    if (field.type === 'password') {
                        field.type = 'text';
                        btn.innerHTML = EYE_OPEN;
                    } else {
                        field.type = 'password';
                        btn.innerHTML = EYE_CLOSED;
                    }
                }

                function showError(fieldId, msg) {
                    const el = document.getElementById(fieldId + '-error');
                    el.textContent = msg;
                    el.classList.add('visible');
                }

                function clearErrors() {
                    document.querySelectorAll('.error-msg').forEach(el => {
                        el.textContent = '';
                        el.classList.remove('visible');
                    });
                }

                function showAlert(type, message) {
                    const box = document.getElementById('alert-box');
                    box.className = 'alert alert-' + type;
                    box.innerHTML = message;
                    box.style.display = 'block';
                }

                async function handleSubmit() {
                    clearErrors();

                    const newPassword = document.getElementById('newPassword').value;
                    const confirmPassword = document.getElementById('confirmPassword').value;
                    const btn = document.getElementById('submitBtn');

                    let hasError = false;

                    if (!newPassword || newPassword.length < 8) {
                        showError('newPassword', 'Password must be at least 8 characters');
                        hasError = true;
                    }

                    if (!confirmPassword) {
                        showError('confirmPassword', 'Please confirm your password');
                        hasError = true;
                    } else if (newPassword !== confirmPassword) {
                        showError('confirmPassword', 'Passwords do not match');
                        hasError = true;
                    }

                    if (hasError) return;

                    btn.disabled = true;
                    btn.innerHTML = '<span class="spinner"></span> Saving...';

                    try {
                        const resp = await fetch(window.location.origin + '/api/password-reset/reset', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ token: TOKEN, newPassword }),
                        });

                        const data = await resp.json();

                        if (resp.ok && data.success) {
                            document.getElementById('form-container').style.display = 'none';
                            document.getElementById('success-container').style.display = 'block';
                        } else {
                            showAlert('error', '<strong>⚠️ ' + (data.error || 'Failed to reset password') + '</strong>');
                            btn.disabled = false;
                            btn.innerHTML = 'Save New Password';
                        }
                    } catch (err) {
                        showAlert('error', '<strong>⚠️ Network error. Please try again.</strong>');
                        btn.disabled = false;
                        btn.innerHTML = 'Save New Password';
                    }
                }
            </script>
        `}

        <div class="lock-icon">🔒 256-bit AES encrypted · Secure processing</div>
    </div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
});

module.exports = router;
