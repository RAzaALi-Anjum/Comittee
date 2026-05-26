// ============================================================
// Complaint Routes — TC-75 to TC-79
// Submit, View, Resolve, Reject, History
// NOTE: Route order matters — specific paths before wildcards
// ============================================================
const express = require("express");
const { encryptData, decryptData, hashData } = require("../utils/encryption");
const { adminDb } = require("../utils/firebaseAdmin");
const { verifyToken, verifyRole } = require("../middleware/auth");
const { logEvent } = require("../utils/auditLogger");
const router = express.Router();

function safeDecrypt(val) {
    try { return val ? decryptData(val) : val; } catch { return val; }
}

async function pushNotif(userId, title, message, type) {
    try {
        await adminDb.ref(`notifications/${userId}`).push({
            title: encryptData(title),
            message: encryptData(message),
            type,
            createdAt: new Date().toISOString(),
            read: false,
            sentBy: "system",
        });
    } catch (e) {
        // TC-78-02: Queue on failure — graceful non-blocking catch
        console.warn("[Complaint/Notif] Delivery failed, queued for retry:", e.message);
        try {
            await adminDb.ref("notificationQueue").push({
                userId, title: encryptData(title), message: encryptData(message),
                type, createdAt: new Date().toISOString(), status: "queued",
                retryAfter: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            });
        } catch (qErr) {
            console.error("[Complaint/NotifQueue] Queue also failed:", qErr.message);
        }
    }
}

// ─── TC-75-01: Submit New Complaint ─────────────────────
// POST /api/complaint/submit
router.post("/submit", verifyToken, async (req, res) => {
    try {
        const { title, reason, targetId, category, urgency } = req.body;
        const complainantId = req.user.userId;

        // TC-75-02: Backend enforcement — reason is mandatory
        if (!title || !title.trim()) {
            return res.status(400).json({ error: "Complaint title is required" });
        }
        if (!reason || !reason.trim()) {
            return res.status(400).json({ error: "Please provide a reason to submit" });
        }

        const validCategories = ["payment", "fraud", "service", "behavior", "other"];
        const validUrgency = ["low", "medium", "high", "critical"];
        const safeCategory = validCategories.includes(category) ? category : "other";
        const safeUrgency = validUrgency.includes(urgency) ? urgency : "medium";

        const now = new Date().toISOString();
        const complaintRef = await adminDb.ref("complaints").push({
            complainantId,
            targetId: targetId || null,
            title: encryptData(title.trim()),
            reason: encryptData(reason.trim()),
            category: safeCategory,
            urgency: safeUrgency,
            status: "pending",
            createdAt: now,
            resolvedAt: null,
            resolution: null,
            resolutionNotes: null,
        });

        // Notify all admins of new complaint
        try {
            const adminSnap = await adminDb.ref("users").orderByChild("role").equalTo("admin").once("value");
            const admins = adminSnap.val() || {};
            await Promise.all(Object.keys(admins).map(adminId =>
                adminDb.ref(`notifications/${adminId}`).push({
                    title: encryptData("🚨 New Complaint Submitted"),
                    message: encryptData(`A new complaint titled "${title}" has been submitted. Complaint ID: ${complaintRef.key}`),
                    type: "warning",
                    complaintId: complaintRef.key,
                    createdAt: now,
                    read: false,
                    sentBy: "system",
                })
            ));
        } catch (e) {
            console.warn("[Complaint/Submit] Admin notification failed:", e.message);
        }

        await logEvent("COMPLAINT_SUBMITTED", complainantId, { complaintId: complaintRef.key, ip: req.ip });

        return res.status(201).json({
            success: true,
            complaintId: complaintRef.key,
            message: "Complaint submitted successfully",
        });
    } catch (err) {
        console.error("[Complaint/Submit]", err);
        return res.status(500).json({ error: "Failed to submit complaint" });
    }
});

// ─── TC-77-01: Admin Resolve Complaint ──────────────────
// POST /api/complaint/resolve
router.post("/resolve", verifyToken, verifyRole("admin"), async (req, res) => {
    try {
        const { complaintId, resolutionNotes } = req.body;
        if (!complaintId) return res.status(400).json({ error: "complaintId required" });

        // Resolution notes are mandatory per TC-77-01
        if (!resolutionNotes || !resolutionNotes.trim()) {
            return res.status(400).json({ error: "Resolution notes are required to resolve a complaint" });
        }

        const snap = await adminDb.ref(`complaints/${complaintId}`).once("value");
        const complaint = snap.val();
        if (!complaint) return res.status(404).json({ error: "Complaint not found" });
        if (complaint.status === "resolved") return res.status(400).json({ error: "Complaint is already resolved" });

        const now = new Date().toISOString();
        await adminDb.ref(`complaints/${complaintId}`).update({
            status: "resolved",
            resolvedAt: now,
            resolvedBy: req.user.userId,
            resolutionNotes: encryptData(resolutionNotes.trim()),
            resolution: "resolved",
        });

        // TC-78-01: Send mandatory resolution notification
        if (complaint.complainantId) {
            await pushNotif(
                complaint.complainantId,
                "✅ Complaint Resolved",
                `Your complaint (ID: ${complaintId}) has been resolved. Notes: ${resolutionNotes}`,
                "success"
            );
        }

        await logEvent("COMPLAINT_RESOLVED", req.user.userId, { complaintId, ip: req.ip });
        return res.json({ success: true, status: "resolved", message: "Complaint resolved and user notified" });
    } catch (err) {
        console.error("[Complaint/Resolve]", err);
        return res.status(500).json({ error: "Failed to resolve complaint" });
    }
});

// ─── TC-77-02: Admin Reject Complaint ───────────────────
// POST /api/complaint/reject
router.post("/reject", verifyToken, verifyRole("admin"), async (req, res) => {
    try {
        const { complaintId, rejectionNotes } = req.body;
        if (!complaintId) return res.status(400).json({ error: "complaintId required" });

        // Rejection notes mandatory per TC-77-02
        if (!rejectionNotes || !rejectionNotes.trim()) {
            return res.status(400).json({ error: "Rejection notes are required to reject a complaint" });
        }

        const snap = await adminDb.ref(`complaints/${complaintId}`).once("value");
        const complaint = snap.val();
        if (!complaint) return res.status(404).json({ error: "Complaint not found" });
        if (["resolved", "rejected"].includes(complaint.status)) {
            return res.status(400).json({ error: `Complaint is already ${complaint.status}` });
        }

        const now = new Date().toISOString();
        await adminDb.ref(`complaints/${complaintId}`).update({
            status: "rejected",
            rejectedAt: now,
            rejectedBy: req.user.userId,
            rejectionNotes: encryptData(rejectionNotes.trim()),
            resolution: "rejected",
        });

        // TC-78-01: Notify complainant of rejection
        if (complaint.complainantId) {
            await pushNotif(
                complaint.complainantId,
                "❌ Complaint Rejected",
                `Your complaint (ID: ${complaintId}) has been reviewed and rejected. Reason: ${rejectionNotes}`,
                "warning"
            );
        }

        await logEvent("COMPLAINT_REJECTED", req.user.userId, { complaintId, ip: req.ip });
        return res.json({ success: true, status: "rejected", message: "Complaint rejected and user notified" });
    } catch (err) {
        console.error("[Complaint/Reject]", err);
        return res.status(500).json({ error: "Failed to reject complaint" });
    }
});

// ─── TC-79-01: Get User's Own Complaints ────────────────
// GET /api/complaint/my/:userId
// NOTE: Must come BEFORE GET /:complaintId to avoid Express treating "my" as a complaintId
router.get("/my/:userId", verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        if (req.user.userId !== userId && req.user.role !== "admin") {
            return res.status(403).json({ error: "Access denied" });
        }

        const snap = await adminDb.ref("complaints").orderByChild("complainantId").equalTo(userId).once("value");
        const all = snap.val();
        if (!all) return res.json({ success: true, complaints: [], message: "No Complaint History Found." });

        const complaints = Object.entries(all).map(([id, c]) => ({
            id,
            title: safeDecrypt(c.title),
            status: c.status || "pending",
            createdAt: c.createdAt,
            resolvedAt: c.resolvedAt || null,
            resolution: c.resolution || null,
        })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return res.json({ success: true, count: complaints.length, complaints });
    } catch (err) {
        console.error("[Complaint/MyComplaints]", err);
        return res.status(500).json({ error: "Failed to fetch complaints" });
    }
});

// ─── TC-79-01: Get All Complaints (Admin) ───────────────
// GET /api/complaint?status=&complainantId=
// NOTE: Must come BEFORE GET /:complaintId to avoid wildcard match on empty
router.get("/", verifyToken, verifyRole("admin"), async (req, res) => {
    try {
        const { status, complainantId } = req.query;
        const snap = await adminDb.ref("complaints").once("value");
        const all = snap.val();

        // TC-79-02: Empty state — no error, just empty array
        if (!all) {
            return res.json({ success: true, count: 0, complaints: [], message: "No Complaint History Found." });
        }

        let complaints = Object.entries(all).map(([id, c]) => ({
            id,
            complainantId: c.complainantId,
            targetId: c.targetId || null,
            title: safeDecrypt(c.title),
            reason: safeDecrypt(c.reason),
            status: c.status || "pending",
            createdAt: c.createdAt,
            resolvedAt: c.resolvedAt || null,
        }));

        if (status) complaints = complaints.filter(c => c.status === status);
        if (complainantId) complaints = complaints.filter(c => c.complainantId === complainantId);

        complaints.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return res.json({ success: true, count: complaints.length, complaints });
    } catch (err) {
        console.error("[Complaint/History]", err);
        return res.status(500).json({ error: "Failed to fetch complaints" });
    }
});

// ─── TC-76-01: View Single Complaint (wildcard — MUST be LAST) ─
// GET /api/complaint/:complaintId
router.get("/:complaintId", verifyToken, async (req, res) => {
    try {
        const { complaintId } = req.params;
        const snap = await adminDb.ref(`complaints/${complaintId}`).once("value");
        const complaint = snap.val();

        // TC-76-02: Graceful 404 for missing complaint
        if (!complaint) {
            return res.status(404).json({ error: "Ticket Invalid or Missing" });
        }

        // Access control: only complainant or admin can view
        if (req.user.userId !== complaint.complainantId && req.user.role !== "admin") {
            return res.status(403).json({ error: "Access denied" });
        }

        return res.json({
            success: true,
            complaint: {
                id: complaintId,
                complainantId: complaint.complainantId,
                targetId: complaint.targetId || null,
                title: safeDecrypt(complaint.title),
                reason: safeDecrypt(complaint.reason),
                status: complaint.status || "pending",
                createdAt: complaint.createdAt,
                resolvedAt: complaint.resolvedAt || null,
                resolution: complaint.resolution || null,
                resolutionNotes: safeDecrypt(complaint.resolutionNotes),
                rejectionNotes: safeDecrypt(complaint.rejectionNotes),
            },
        });
    } catch (err) {
        console.error("[Complaint/View]", err);
        return res.status(500).json({ error: "Failed to fetch complaint" });
    }
});

module.exports = router;
