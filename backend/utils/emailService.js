// ============================================================
// Email Service — Nodemailer-based email delivery
// Sends emails on signup, payment confirmation, complaint resolution
// ============================================================
const nodemailer = require("nodemailer");

// Configure transporter — uses env vars for flexibility
// Supports Gmail SMTP by default, configurable via env
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: process.env.EMAIL_SECURE === "true",
    auth: {
        user: process.env.EMAIL_USER || "",
        pass: process.env.EMAIL_PASS || "", // Gmail: use App Password, not regular password
    },
});

const FROM_ADDRESS = process.env.EMAIL_FROM || process.env.EMAIL_USER || "noreply@digitalcommittee.pk";
const APP_NAME = "Digital Committee";

/**
 * Send an email with error handling — non-blocking.
 * Returns true on success, false on failure (never throws).
 */
async function sendEmail(to, subject, htmlBody, textBody) {
    if (!to || !process.env.EMAIL_USER) {
        console.warn("[Email] Skipped — no recipient or EMAIL_USER not configured.");
        return false;
    }
    try {
        const info = await transporter.sendMail({
            from: `"${APP_NAME}" <${FROM_ADDRESS}>`,
            to,
            subject: `[${APP_NAME}] ${subject}`,
            html: htmlBody,
            text: textBody || subject,
        });
        console.log(`[Email] Sent to ${to}: ${info.messageId}`);
        return true;
    } catch (err) {
        console.error(`[Email] Failed to send to ${to}:`, err.message);
        return false;
    }
}

/**
 * Welcome email on signup
 */
async function sendWelcomeEmail(email, fullName) {
    const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #800000, #B22222); color: #fff; padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Welcome to Digital Committee!</h1>
      </div>
      <div style="background: #ffffff; padding: 30px; border: 1px solid #eee; border-radius: 0 0 16px 16px;">
        <p style="font-size: 16px;">Hi <strong>${fullName || "User"}</strong>,</p>
        <p>Your account has been created successfully. Complete your profile to start joining committees.</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #666;">Next steps:</p>
          <ul style="color: #333; margin: 8px 0;">
            <li>Upload your CNIC for verification</li>
            <li>Complete your profile information</li>
            <li>Browse and join committees</li>
          </ul>
        </div>
        <p style="color: #999; font-size: 12px;">This is an automated message from ${APP_NAME}.</p>
      </div>
    </div>`;
    return sendEmail(email, "Welcome to Digital Committee", html);
}

/**
 * Payment confirmation email
 */
async function sendPaymentConfirmation(email, { amount, committeeName, transactionId, method }) {
    const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #10B981, #059669); color: #fff; padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">✓ Payment Received</h1>
      </div>
      <div style="background: #ffffff; padding: 30px; border: 1px solid #eee; border-radius: 0 0 16px 16px;">
        <p style="font-size: 16px;">Your payment has been submitted and is pending verification.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px; color: #666;">Committee</td><td style="padding: 8px; font-weight: bold;">${committeeName || "—"}</td></tr>
          <tr><td style="padding: 8px; color: #666;">Amount</td><td style="padding: 8px; font-weight: bold;">Rs ${Number(amount).toLocaleString()}</td></tr>
          <tr><td style="padding: 8px; color: #666;">Transaction ID</td><td style="padding: 8px; font-weight: bold; font-family: monospace;">${transactionId}</td></tr>
          <tr><td style="padding: 8px; color: #666;">Method</td><td style="padding: 8px;">${method || "—"}</td></tr>
          <tr><td style="padding: 8px; color: #666;">Status</td><td style="padding: 8px; color: #F59E0B; font-weight: bold;">Pending Verification</td></tr>
        </table>
        <p style="color: #999; font-size: 12px;">You will receive a notification once your payment is verified by admin.</p>
      </div>
    </div>`;
    return sendEmail(email, `Payment Submitted — Rs ${amount}`, html);
}

/**
 * Complaint resolution email
 */
async function sendComplaintResolutionEmail(email, { complaintId, status, notes }) {
    const isResolved = status === "resolved";
    const color = isResolved ? "#10B981" : "#EF4444";
    const label = isResolved ? "Resolved" : "Rejected";
    const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: ${color}; color: #fff; padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Complaint ${label}</h1>
      </div>
      <div style="background: #ffffff; padding: 30px; border: 1px solid #eee; border-radius: 0 0 16px 16px;">
        <p style="font-size: 16px;">Your complaint <strong>${complaintId}</strong> has been <strong>${label.toLowerCase()}</strong>.</p>
        ${notes ? `<div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;"><p style="margin: 0; color: #666;">Admin Notes:</p><p style="margin: 8px 0; color: #333;">${notes}</p></div>` : ""}
        <p style="color: #999; font-size: 12px;">If you have further concerns, submit a new complaint from the app.</p>
      </div>
    </div>`;
    return sendEmail(email, `Complaint ${label} — ${complaintId}`, html);
}

/**
 * Password reset email with one-time link
 */
async function sendPasswordResetEmail(email, fullName, resetLink) {
    const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #800000, #B22222); color: #fff; padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">🔐 Password Reset Request</h1>
      </div>
      <div style="background: #ffffff; padding: 30px; border: 1px solid #eee; border-radius: 0 0 16px 16px;">
        <p style="font-size: 16px;">Hi <strong>${fullName || "User"}</strong>,</p>
        <p>We received a request to reset your password for your Digital Committee account. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #800000, #B22222); color: #fff; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-weight: bold; font-size: 16px;">
            Reset My Password
          </a>
        </div>
        <div style="background: #FEF2F2; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #FECACA;">
          <p style="margin: 0; color: #991B1B; font-size: 13px;">⚠️ <strong>Important:</strong></p>
          <ul style="color: #991B1B; font-size: 13px; margin: 8px 0 0 0; padding-left: 18px;">
            <li>This link expires in <strong>15 minutes</strong></li>
            <li>This link can only be used <strong>once</strong></li>
            <li>If you didn't request this, ignore this email</li>
          </ul>
        </div>
        <p style="color: #6B7280; font-size: 12px; margin-top: 20px;">If the button doesn't work, copy and paste this link in your browser:</p>
        <p style="color: #3B82F6; font-size: 12px; word-break: break-all;">${resetLink}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 11px;">This is an automated message from ${APP_NAME}. Do not reply to this email.</p>
      </div>
    </div>`;
    return sendEmail(email, "Reset Your Password", html);
}

module.exports = {
    sendEmail,
    sendWelcomeEmail,
    sendPasswordResetEmail,
    sendPaymentConfirmation,
    sendComplaintResolutionEmail,
};
