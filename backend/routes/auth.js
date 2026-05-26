// ============================================================
// Auth Routes — Signup, Login, Refresh, Logout
// ============================================================
const express = require("express");
const { body } = require("express-validator");
const { hashPassword, comparePassword, encryptData, hashData } = require("../utils/encryption");
const { adminDb, adminFirestore } = require("../utils/firebaseAdmin");
const { generateAccessToken, generateRefreshToken, verifyToken } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validate");
const { logEvent } = require("../utils/auditLogger");
const { sendWelcomeEmail } = require("../utils/emailService");

const router = express.Router();

// ─── SIGNUP ─────────────────────────────────────────────
router.post(
    "/signup",
    [
        body("email").isEmail().normalizeEmail().withMessage("Valid email is required"),
        body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
        body("fullName").trim().isLength({ min: 2 }).withMessage("Full name is required"),
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { email, password, fullName } = req.body;

            // 1. Hash the password with bcrypt
            const hashedPassword = await hashPassword(password);

            // 2. Create a system ID
            const systemId = `USR-${Date.now().toString(36).toUpperCase().slice(-6)}`;

            // 3. Store user profile in Firebase RTDB
            // Note: Firebase Auth user creation is handled by the frontend
            // This endpoint secures the password hash storage
            const userId = req.body.userId; // Frontend sends Firebase Auth UID after creation

            if (userId) {
                await adminDb.ref(`users/${userId}`).update({
                    fullName: encryptData(fullName),
                    fullName_hash: hashData(fullName),
                    email: encryptData(email),
                    email_hash: hashData(email),
                    passwordHash: hashedPassword,
                    systemId,
                    isComplete: false,
                    role: "user",
                    initiatorStatus: "none",
                    createdAt: new Date().toISOString(),
                });
            }

            // 4. Generate JWT tokens
            const tokenPayload = {
                userId: userId || "pending",
                email,
                role: "user",
                initiatorStatus: "none",
            };

            const accessToken = generateAccessToken(tokenPayload);
            const refreshToken = generateRefreshToken(tokenPayload);

            // 5. Store refresh token in Firebase
            if (userId) {
                await adminDb.ref(`refreshTokens/${userId}`).set({
                    token: hashData(refreshToken),
                    createdAt: new Date().toISOString(),
                });
            }

            // 6. Log event
            await logEvent("SIGNUP", userId, { email, ip: req.ip });

            // 6b. Send welcome email (non-blocking)
            sendWelcomeEmail(email, fullName).catch(() => {});

            // 7. Set HTTP-only cookie (for web)
            res.cookie("accessToken", accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 15 * 60 * 1000, // 15 min
            });

            res.cookie("refreshToken", refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            });

            return res.status(201).json({
                success: true,
                accessToken,
                refreshToken,
                systemId,
                userId: userId || "pending",
            });
        } catch (err) {
            console.error("[Auth/Signup] Error:", err);
            await logEvent("FAILED_LOGIN", null, { action: "signup", error: err.message, ip: req.ip });
            return res.status(500).json({ error: "Signup failed. Please try again." });
        }
    }
);

// ─── LOGIN ──────────────────────────────────────────────
router.post(
    "/login",
    [
        body("email").isEmail().normalizeEmail().withMessage("Valid email is required"),
        body("password").notEmpty().withMessage("Password is required"),
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { email, password, userId } = req.body;

            if (!userId) {
                return res.status(400).json({ error: "User ID is required" });
            }

            // 1. Fetch stored user data
            const snapshot = await adminDb.ref(`users/${userId}`).once("value");
            const userData = snapshot.val();

            if (!userData) {
                await logEvent("FAILED_LOGIN", userId, { reason: "User not found", email, ip: req.ip });
                return res.status(404).json({ error: "User not found" });
            }

            // 2. Verify password with bcrypt (if hash exists)
            if (userData.passwordHash) {
                const isValid = await comparePassword(password, userData.passwordHash);
                if (!isValid) {
                    await logEvent("FAILED_LOGIN", userId, { reason: "Invalid password", email, ip: req.ip });
                    return res.status(401).json({ error: "Invalid credentials" });
                }
            }

            // 3. Sync live role and status from Firestore to RTDB if out of sync
            let firestoreRole = null;
            let firestoreInitiatorStatus = null;
            try {
                const fsDoc = await adminFirestore.collection("users").doc(userId).get();
                if (fsDoc.exists) {
                    const fsData = fsDoc.data();
                    firestoreRole = fsData.role;
                    firestoreInitiatorStatus = fsData.initiatorStatus;
                }
            } catch (fsErr) {
                console.warn("[Auth/Login] Firestore role fetch failed:", fsErr.message);
            }

            const finalRole = firestoreRole || userData.role || "user";
            const finalInitiatorStatus = firestoreInitiatorStatus || userData.initiatorStatus || "none";

            // Sync back to RTDB if they differ
            if (firestoreRole && userData.role !== firestoreRole) {
                try {
                    await adminDb.ref(`users/${userId}`).update({
                        role: firestoreRole,
                        initiatorStatus: firestoreInitiatorStatus || null
                    });
                } catch (dbErr) {
                    console.warn("[Auth/Login] Syncing role to RTDB failed:", dbErr.message);
                }
            }

            // Generate tokens
            const tokenPayload = {
                userId,
                email,
                role: finalRole,
                initiatorStatus: finalInitiatorStatus,
            };

            const accessToken = generateAccessToken(tokenPayload);
            const refreshToken = generateRefreshToken(tokenPayload);

            // 4. Store refresh token
            await adminDb.ref(`refreshTokens/${userId}`).set({
                token: hashData(refreshToken),
                createdAt: new Date().toISOString(),
            });

            // 5. Log event
            await logEvent("LOGIN", userId, { email, ip: req.ip });

            // 6. Set cookies
            res.cookie("accessToken", accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 15 * 60 * 1000,
            });

            res.cookie("refreshToken", refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });

            return res.json({
                success: true,
                accessToken,
                refreshToken,
                role: userData.role || "user",
                initiatorStatus: userData.initiatorStatus || "none",
            });
        } catch (err) {
            console.error("[Auth/Login] Error:", err);
            await logEvent("FAILED_LOGIN", req.body?.userId, { error: err.message, ip: req.ip });
            return res.status(500).json({ error: "Login failed. Please try again." });
        }
    }
);

// ─── REFRESH TOKEN ──────────────────────────────────────
router.post("/refresh", async (req, res) => {
    try {
        let refreshToken = req.body.refreshToken;
        if (!refreshToken && req.cookies) {
            refreshToken = req.cookies.refreshToken;
        }

        if (!refreshToken) {
            return res.status(401).json({ error: "Refresh token is required" });
        }

        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

        // Verify refresh token exists in Firebase
        const storedRef = await adminDb.ref(`refreshTokens/${decoded.userId}`).once("value");
        const storedData = storedRef.val();

        if (!storedData || storedData.token !== hashData(refreshToken)) {
            await logEvent("SUSPICIOUS_TOKEN", decoded.userId, { reason: "Refresh token mismatch", ip: req.ip });
            return res.status(401).json({ error: "Invalid refresh token" });
        }

        // Fetch live user role and status from database
        const userSnap = await adminDb.ref(`users/${decoded.userId}`).once("value");
        const userData = userSnap.val() || {};

        // Fetch live user role and status from Firestore for consistency
        let firestoreRole = null;
        let firestoreInitiatorStatus = null;
        try {
            const fsDoc = await adminFirestore.collection("users").doc(decoded.userId).get();
            if (fsDoc.exists) {
                const fsData = fsDoc.data();
                firestoreRole = fsData.role;
                firestoreInitiatorStatus = fsData.initiatorStatus;
            }
        } catch (fsErr) {
            console.warn("[Auth/Refresh] Firestore role fetch failed:", fsErr.message);
        }

        const finalRole = firestoreRole || userData.role || decoded.role || "user";
        const finalInitiatorStatus = firestoreInitiatorStatus || userData.initiatorStatus || decoded.initiatorStatus || "none";

        // Sync back to RTDB if they differ
        if (firestoreRole && userData.role !== firestoreRole) {
            try {
                await adminDb.ref(`users/${decoded.userId}`).update({
                    role: firestoreRole,
                    initiatorStatus: firestoreInitiatorStatus || null
                });
            } catch (dbErr) {
                console.warn("[Auth/Refresh] Syncing role to RTDB failed:", dbErr.message);
            }
        }

        // Generate new access token
        const newPayload = {
            userId: decoded.userId,
            email: decoded.email,
            role: finalRole,
            initiatorStatus: finalInitiatorStatus,
        };
        const newAccessToken = generateAccessToken(newPayload);

        res.cookie("accessToken", newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 15 * 60 * 1000,
        });

        return res.json({ success: true, accessToken: newAccessToken });
    } catch (err) {
        console.error("[Auth/Refresh] Error:", err);
        return res.status(401).json({ error: "Invalid or expired refresh token" });
    }
});

// ─── LOGOUT ─────────────────────────────────────────────
router.post("/logout", verifyToken, async (req, res) => {
    try {
        // Remove refresh token from Firebase
        await adminDb.ref(`refreshTokens/${req.user.userId}`).remove();

        // Clear cookies
        res.clearCookie("accessToken");
        res.clearCookie("refreshToken");

        return res.json({ success: true, message: "Logged out successfully" });
    } catch (err) {
        console.error("[Auth/Logout] Error:", err);
        return res.status(500).json({ error: "Logout failed" });
    }
});

module.exports = router;
