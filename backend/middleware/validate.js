// ============================================================
// Input Validation & Sanitization Middleware
// ============================================================
const { validationResult } = require("express-validator");

/**
 * Middleware: check express-validator results and return 400 if invalid.
 */
function validateRequest(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Validation failed", details: errors.array() });
    }
    next();
}

/**
 * Middleware: sanitize request body to prevent NoSQL injection.
 * Strips keys starting with $ and deeply nested objects with $ keys.
 */
function sanitizeInput(req, res, next) {
    if (req.body && typeof req.body === "object") {
        req.body = deepSanitize(req.body);
    }
    if (req.query && typeof req.query === "object") {
        req.query = deepSanitize(req.query);
    }
    next();
}

function deepSanitize(obj) {
    if (Array.isArray(obj)) {
        return obj.map(deepSanitize);
    }
    if (obj && typeof obj === "object") {
        const cleaned = {};
        for (const key of Object.keys(obj)) {
            // Block NoSQL injection operators
            if (key.startsWith("$")) continue;
            // Block prototype pollution
            if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
            cleaned[key] = deepSanitize(obj[key]);
        }
        return cleaned;
    }
    // Strip HTML tags from strings (XSS prevention)
    if (typeof obj === "string") {
        return obj.replace(/<[^>]*>/g, "");
    }
    return obj;
}

module.exports = { validateRequest, sanitizeInput };
