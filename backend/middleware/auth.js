// ============================================================
// JWT Authentication & Role-Based Authorization Middleware
// ============================================================
const jwt = require("jsonwebtoken");
const { logEvent } = require("../utils/auditLogger");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

/**
 * Generate a short-lived access token.
 */
function generateAccessToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

/**
 * Generate a long-lived refresh token.
 */
function generateRefreshToken(payload) {
    return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

/**
 * Middleware: Verify JWT access token.
 * Checks Authorization header (Bearer) and falls back to HTTP-only cookie.
 */
function verifyToken(req, res, next) {
    let token = null;

    // 1. Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    }

    // 2. Fallback to cookie
    if (!token && req.cookies && req.cookies.accessToken) {
        token = req.cookies.accessToken;
    }

    if (!token) {
        logEvent("SUSPICIOUS_TOKEN", null, { reason: "No token provided", ip: req.ip });
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { userId, email, role, initiatorStatus }
        next();
    } catch (err) {
        logEvent("SUSPICIOUS_TOKEN", null, { reason: "Invalid/expired token", ip: req.ip, error: err.message });
        return res.status(401).json({ error: "Invalid or expired token." });
    }
}

/**
 * Middleware: Optionally verify JWT — allows through even without token.
 * If token is valid, sets req.user from JWT.
 * If no token or invalid token, sets req.user from body/params userId.
 * This is used for profile save/get so encryption works even before
 * the user has a backend JWT (e.g. first-time signup profile save).
 */
function optionalToken(req, res, next) {
    let token = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    }
    if (!token && req.cookies && req.cookies.accessToken) {
        token = req.cookies.accessToken;
    }

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            return next();
        } catch (err) {
            // Token invalid/expired — fall through to userId-based auth
        }
    }

    // No valid token — use userId from body or params
    const userId = req.body?.userId || req.params?.userId;
    if (userId) {
        req.user = { userId, role: "user" };
        return next();
    }

    return res.status(401).json({ error: "Access denied. No token or userId provided." });
}

/**
 * Middleware factory: Verify user has one of the specified roles.
 * @param  {...string} allowedRoles — e.g. "admin", "initiator", "user"
 */
function verifyRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: "Authentication required." });
        }

        const userRole = req.user.role || "user";
        const initiatorStatus = req.user.initiatorStatus || "none";

        if (allowedRoles.includes(userRole)) {
            return next();
        }

        if (allowedRoles.includes("initiator") && initiatorStatus === "approved") {
            return next();
        }

        if (allowedRoles.includes("self")) {
            const resourceUserId = req.params.userId || req.body.userId;
            if (resourceUserId && resourceUserId === req.user.userId) {
                return next();
            }
        }

        logEvent("ROLE_VIOLATION", req.user.userId, {
            attemptedRole: userRole,
            requiredRoles: allowedRoles,
            path: req.originalUrl,
            ip: req.ip,
        });

        return res.status(403).json({ error: "Access denied. Insufficient permissions." });
    };
}

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyToken,
    optionalToken,
    verifyRole,
};
