// ============================================================
// Digital Committee — Secure Backend Server
// ============================================================
require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const { sanitizeInput } = require("./middleware/validate");
const { logEvent } = require("./utils/auditLogger");

// ── Route Modules ───────────────────────────────────────
const authRoutes = require("./routes/auth");
const dataRoutes = require("./routes/data");
const profileRoutes = require("./routes/profile");
const paymentRoutes = require("./routes/payment");
const ocrRoutes = require("./routes/ocr");
const walletRoutes = require("./routes/wallet");
const notificationRoutes = require("./routes/notification");
const locationRoutes = require("./routes/location");
const uploadRoutes = require("./routes/upload");
// New FR routes
const committeeRoutes = require("./routes/committee");
const loanRoutes = require("./routes/loan");
const levelRoutes = require("./routes/level");
const feedbackRoutes = require("./routes/feedback");
const warningRoutes = require("./routes/warning");
const turnRoutes = require("./routes/turn");
const complaintRoutes = require("./routes/complaint");
const passwordResetRoutes = require("./routes/passwordReset");
const initiatorPaymentRoutes = require("./routes/initiatorPayment");
const { startReminderScheduler, sendDeadlineReminders } = require("./utils/reminderScheduler");

const app = express();
const PORT = process.env.PORT || 5000;

// ═══════════════════════════════════════════════════════
// SECURITY MIDDLEWARE
// ═══════════════════════════════════════════════════════

// 1. Helmet — sets various HTTP headers for security
app.use(
    helmet({
        contentSecurityPolicy: false,
    })
);

// 2. CORS — restrict origins
app.use(
    cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (mobile apps, curl, etc.)
            if (!origin) return callback(null, true);
            
            // Allow all localhost and local network origins in development
            if (
                origin.match(/^http:\/\/localhost(:\d+)?$/) ||
                origin.match(/^http:\/\/127\.0\.0\.1(:\d+)?$/) ||
                origin.match(/^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/) ||
                origin.match(/^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/) ||
                origin.match(/^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+(:\d+)?$/)
            ) {
                return callback(null, true);
            }
            
            // In production, check against allowed origins
            const allowed = (process.env.CORS_ORIGIN || "").split(",").map(s => s.trim());
            if (allowed.includes(origin)) {
                return callback(null, true);
            }
            callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

// 3. Rate Limiting — prevent abuse
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: "Too many requests. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV !== "production",
});
app.use(generalLimiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20, // 20 auth attempts per 15 minutes
    message: { error: "Too many authentication attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV !== "production",
});

// Stricter rate limit for payment endpoints
const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // 10 payment attempts per 15 minutes
    message: { error: "Too many payment attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV !== "production",
});

// 4. Body Parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 5. Cookie Parser
app.use(cookieParser());

// 6. Input Sanitization (NoSQL injection + XSS protection)
app.use(sanitizeInput);

// 7. Serve uploaded files as static assets
const path = require("path");
const fs = require("fs");
const uploadsPath = path.join(__dirname, "uploads", "files");
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
app.use("/uploads", express.static(uploadsPath));


// ═══════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/data", dataRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/payment", paymentLimiter, paymentRoutes);
app.use("/api/payment/initiator", paymentLimiter, initiatorPaymentRoutes);
app.use("/api/ocr", ocrRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/notification", notificationRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/upload", uploadRoutes);
// New FR routes
app.use("/api/committee", committeeRoutes);
app.use("/api/loan", loanRoutes);
app.use("/api/level", levelRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/warning", warningRoutes);
app.use("/api/turn", turnRoutes);
app.use("/api/complaint", complaintRoutes);
app.use("/api/password-reset", authLimiter, passwordResetRoutes);

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        security: {
            helmet: true,
            cors: true,
            rateLimiting: true,
            encryption: "AES-256-CBC",
            hashing: "bcrypt + SHA-256",
            authentication: "JWT (access + refresh)",
        },
    });
});

// ═══════════════════════════════════════════════════════
// GLOBAL ERROR HANDLER
// ═══════════════════════════════════════════════════════

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use(async (err, req, res, next) => {
    console.error("[Server Error]", err);

    // Log the error
    try {
        await logEvent("SERVER_ERROR", req.user?.userId || null, {
            error: err.message,
            stack: err.stack?.substring(0, 500),
            path: req.originalUrl,
            method: req.method,
            ip: req.ip,
        });
    } catch (logErr) {
        console.error("[AuditLog] Failed to log server error:", logErr);
    }

    // Multer errors
    if (err.name === "MulterError") {
        return res.status(400).json({ error: `File upload error: ${err.message}` });
    }

    // JWT errors
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Authentication failed" });
    }

    // Default 500
    res.status(500).json({
        error: process.env.NODE_ENV === "production"
            ? "Internal server error"
            : err.message,
    });
});

// ═══════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════

app.listen(PORT, "0.0.0.0", () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║    Digital Committee — Secure Backend Server       ║
║────────────────────────────────────────────────────║
║  Port:          ${PORT}                               ║
║  Encryption:    AES-256-CBC                        ║
║  Hashing:       bcrypt + SHA-256                   ║
║  Auth:          JWT (access + refresh tokens)      ║
║  Protection:    Helmet, CORS, Rate Limiting        ║
║  Sanitization:  NoSQL + XSS prevention             ║
║  Reminders:     Cron (daily 08:00)                 ║
╚════════════════════════════════════════════════════╝
  `);

    // Start deadline reminder cron scheduler
    startReminderScheduler();
});

// ── Manual trigger endpoint (admin only, for testing) ──
// POST /api/notification/run-reminders  (already authenticated via notification router)
// This is registered via notification.js — no extra code needed here

module.exports = app;
