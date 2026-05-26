// ============================================================
// Data Encryption / Decryption Routes
// ============================================================
const express = require("express");
const { encryptData, decryptData, hashData, encryptFields, decryptFields } = require("../utils/encryption");
const { verifyToken, verifyRole } = require("../middleware/auth");
const { logEvent } = require("../utils/auditLogger");

const router = express.Router();

// ─── ENCRYPT ────────────────────────────────────────────
// Encrypt arbitrary data fields
router.post("/encrypt", verifyToken, async (req, res) => {
    try {
        const { data, fields } = req.body;

        if (!data || typeof data !== "object") {
            return res.status(400).json({ error: "Data object is required" });
        }

        let encrypted;
        if (Array.isArray(fields) && fields.length > 0) {
            // Encrypt only specified fields
            encrypted = encryptFields(data, fields);
        } else {
            // Encrypt all string values
            encrypted = {};
            for (const [key, value] of Object.entries(data)) {
                if (typeof value === "string" && value.length > 0) {
                    encrypted[key] = encryptData(value);
                    encrypted[`${key}_hash`] = hashData(value);
                } else {
                    encrypted[key] = value;
                }
            }
        }

        await logEvent("DATA_ACCESS", req.user.userId, { action: "encrypt", fieldCount: Object.keys(data).length, ip: req.ip });

        return res.json({ success: true, encrypted });
    } catch (err) {
        console.error("[Data/Encrypt] Error:", err);
        return res.status(500).json({ error: "Encryption failed" });
    }
});

// ─── DECRYPT ────────────────────────────────────────────
// Decrypt data fields (admin or resource owner only)
router.post("/decrypt", verifyToken, verifyRole("admin", "self"), async (req, res) => {
    try {
        const { data, fields } = req.body;

        if (!data || typeof data !== "object") {
            return res.status(400).json({ error: "Data object is required" });
        }

        let decrypted;
        if (Array.isArray(fields) && fields.length > 0) {
            decrypted = decryptFields(data, fields);
        } else {
            decrypted = {};
            for (const [key, value] of Object.entries(data)) {
                if (typeof value === "string" && value.length > 0 && !key.endsWith("_hash")) {
                    decrypted[key] = decryptData(value);
                } else if (!key.endsWith("_hash")) {
                    decrypted[key] = value;
                }
            }
        }

        await logEvent("DATA_ACCESS", req.user.userId, { action: "decrypt", fieldCount: Object.keys(data).length, ip: req.ip });

        return res.json({ success: true, decrypted });
    } catch (err) {
        console.error("[Data/Decrypt] Error:", err);
        return res.status(500).json({ error: "Decryption failed" });
    }
});

// ─── FR-52: Search Users by Name (Admin) ────────────────
// GET /api/data/users/search?name=&role=
router.get("/users/search", verifyToken, verifyRole("admin"), async (req, res) => {
    try {
        const { adminDb } = require("../utils/firebaseAdmin");
        const { name, role } = req.query;
        const snap = await adminDb.ref("users").once("value");
        const all = snap.val() || {};
        let users = Object.entries(all).map(([id, u]) => {
            let fullName = u.fullName;
            try { fullName = fullName ? decryptData(fullName) : fullName; } catch { }
            return { id, fullName, email: u.email, role: u.role, initiatorStatus: u.initiatorStatus, initiatorLevel: u.initiatorLevel };
        });
        if (name) users = users.filter(u => (u.fullName || "").toLowerCase().includes(name.toLowerCase()));
        if (role) users = users.filter(u => (u.role || "").toLowerCase() === role.toLowerCase());
        return res.json({ success: true, count: users.length, users });
    } catch (err) {
        console.error("[Data/UsersSearch]", err);
        return res.status(500).json({ error: "Search failed" });
    }
});

// ─── FR-53: Search Initiators by Name (Admin) ───────────
// GET /api/data/initiators/search?name=
router.get("/initiators/search", verifyToken, async (req, res) => {
    try {
        const { adminDb } = require("../utils/firebaseAdmin");
        const { name } = req.query;
        const snap = await adminDb.ref("users").orderByChild("initiatorStatus").equalTo("approved").once("value");
        const all = snap.val() || {};
        let initiators = Object.entries(all).map(([id, u]) => {
            let fullName = u.fullName;
            try { fullName = fullName ? decryptData(fullName) : fullName; } catch { }
            return {
                id, fullName, email: u.email, initiatorLevel: u.initiatorLevel || 1,
                averageRating: u.averageRating || 0, totalFeedback: u.totalFeedback || 0,
            };
        });
        if (name) initiators = initiators.filter(i => (i.fullName || "").toLowerCase().includes(name.toLowerCase()));
        return res.json({ success: true, count: initiators.length, initiators });
    } catch (err) {
        console.error("[Data/InitiatorsSearch]", err);
        return res.status(500).json({ error: "Search failed" });
    }
});

// ─── FR-56: Filter Initiators by Level and Rating ───────
// GET /api/data/initiators/filter?minLevel=&maxLevel=&minRating=&maxRating=
router.get("/initiators/filter", verifyToken, async (req, res) => {
    try {
        const { adminDb } = require("../utils/firebaseAdmin");
        const { minLevel, maxLevel, minRating, maxRating } = req.query;
        const snap = await adminDb.ref("users").orderByChild("initiatorStatus").equalTo("approved").once("value");
        const all = snap.val() || {};
        let initiators = Object.entries(all).map(([id, u]) => {
            let fullName = u.fullName;
            try { fullName = fullName ? decryptData(fullName) : fullName; } catch { }
            return {
                id, fullName, initiatorLevel: u.initiatorLevel || 1,
                averageRating: u.averageRating || 0, totalFeedback: u.totalFeedback || 0,
            };
        });
        if (minLevel) initiators = initiators.filter(i => i.initiatorLevel >= Number(minLevel));
        if (maxLevel) initiators = initiators.filter(i => i.initiatorLevel <= Number(maxLevel));
        if (minRating) initiators = initiators.filter(i => i.averageRating >= Number(minRating));
        if (maxRating) initiators = initiators.filter(i => i.averageRating <= Number(maxRating));
        return res.json({ success: true, count: initiators.length, initiators });
    } catch (err) {
        console.error("[Data/InitiatorsFilter]", err);
        return res.status(500).json({ error: "Filter failed" });
    }
});

// ─── FR-76: Track Complaint Status ──────────────────────
// GET /api/data/complaint/:complaintId
router.get("/complaint/:complaintId", verifyToken, async (req, res) => {
    try {
        const { adminDb } = require("../utils/firebaseAdmin");
        const { complaintId } = req.params;
        // Try Firestore first via adminDb
        const snap = await adminDb.ref(`complaints/${complaintId}`).once("value");
        const complaint = snap.val();
        if (!complaint) return res.status(404).json({ error: "Complaint not found" });
        if (req.user.userId !== complaint.complainantId && req.user.role !== "admin")
            return res.status(403).json({ error: "Access denied" });
        return res.json({
            success: true,
            complaint: {
                id: complaintId,
                status: complaint.status || "pending",
                createdAt: complaint.createdAt,
                resolvedAt: complaint.resolvedAt || null,
                resolution: complaint.resolution || null,
            },
        });
    } catch (err) {
        console.error("[Data/ComplaintTrack]", err);
        return res.status(500).json({ error: "Failed to fetch complaint status" });
    }
});

module.exports = router;

