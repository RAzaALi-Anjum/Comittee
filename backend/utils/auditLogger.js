// ============================================================
// Audit Logger — writes security events to Firebase
// ============================================================
const { adminDb } = require("./firebaseAdmin");

/**
 * Log a security/audit event to Firebase RTDB.
 * @param {"FAILED_LOGIN"|"SUSPICIOUS_TOKEN"|"PAYMENT_ATTEMPT"|"ROLE_VIOLATION"|"REJECTED_CNIC"|"SIGNUP"|"LOGIN"|"DATA_ACCESS"|"PAYMENT_SUCCESS"|string} type
 * @param {string|null} userId
 * @param {object} details — extra context
 */
async function logEvent(type, userId, details = {}) {
    try {
        const logEntry = {
            type,
            userId: userId || "anonymous",
            details,
            timestamp: new Date().toISOString(),
            ip: details.ip || null,
        };
        await adminDb.ref("auditLogs").push(logEntry);
    } catch (err) {
        console.error("[AuditLogger] Failed to write log:", err.message);
    }
}

module.exports = { logEvent };
