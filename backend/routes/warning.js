// ============================================================
// Warning Routes — FR-80, FR-81, FR-82, FR-83, FR-84
// Late payment warnings, admin temporary payment, recovery
// ============================================================
const express = require("express");
const { encryptData, decryptData, hashData } = require("../utils/encryption");
const { adminDb } = require("../utils/firebaseAdmin");
const { verifyToken, verifyRole } = require("../middleware/auth");
const { logEvent } = require("../utils/auditLogger");
const router = express.Router();

function safeDecrypt(val) { try { return val ? decryptData(val) : val; } catch { return val; } }

async function pushNotif(userId, title, message, type, committeeId = null) {
    try {
        await adminDb.ref(`notifications/${userId}`).push({
            title: encryptData(title), message: encryptData(message),
            type, committeeId, createdAt: new Date().toISOString(), read: false, sentBy: "system",
        });
    } catch (e) { console.warn("[Warning/Notif]", e.message); }
}

// ─── FR-82: Initiator Issues Payment Delay Warning ───────
// POST /api/warning/issue
router.post("/issue", verifyToken, async (req, res) => {
    try {
        const { memberId, committeeId, reason } = req.body;
        if (!memberId || !committeeId) return res.status(400).json({ error: "memberId and committeeId required" });

        // Verify caller is the initiator of this committee or admin
        const commSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
        const comm = commSnap.val();
        if (!comm) return res.status(404).json({ error: "Committee not found" });
        if (comm.createdBy !== req.user.userId && req.user.role !== "admin")
            return res.status(403).json({ error: "Only the committee initiator can issue warnings" });

        const now = new Date().toISOString();
        const warningRef = await adminDb.ref("warnings").push({
            memberId,
            committeeId,
            issuedBy: req.user.userId,
            reason: reason ? encryptData(reason) : encryptData("Payment delay warning"),
            issuedAt: now,
            status: "active",
        });

        // FR-80: Notify the member
        await pushNotif(memberId,
            "⚠️ Payment Warning Issued",
            `You have received a warning for delayed payment in committee. ${reason || "Please pay your dues immediately."}`,
            "warning", committeeId);

        await logEvent("WARNING_ISSUED", req.user.userId, { memberId, committeeId, warningId: warningRef.key, ip: req.ip });
        return res.json({ success: true, warningId: warningRef.key });
    } catch (err) {
        console.error("[Warning/Issue]", err);
        return res.status(500).json({ error: "Failed to issue warning" });
    }
});

// ─── FR-80: Get Warnings for a User ─────────────────────
// GET /api/warning/user/:userId
router.get("/user/:userId", verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        if (req.user.userId !== userId && req.user.role !== "admin")
            return res.status(403).json({ error: "Access denied" });
        const snap = await adminDb.ref("warnings").orderByChild("memberId").equalTo(userId).once("value");
        const all = snap.val() || {};
        const warnings = Object.entries(all).map(([id, w]) => ({
            id, ...w, reason: safeDecrypt(w.reason),
        }));
        return res.json({ success: true, warnings });
    } catch (err) {
        console.error("[Warning/User]", err);
        return res.status(500).json({ error: "Failed to fetch warnings" });
    }
});

// ─── FR-83: Admin Pays Temporarily on Behalf of User ────
// POST /api/warning/admin-pay
router.post("/admin-pay", verifyToken, verifyRole("admin"), async (req, res) => {
    try {
        const { userId, committeeId, amount, note } = req.body;
        if (!userId || !committeeId || !amount)
            return res.status(400).json({ error: "userId, committeeId, amount required" });

        const now = new Date().toISOString();
        const payloadStr = JSON.stringify({ userId, committeeId, amount: Number(amount), paidBy: "admin", timestamp: now });
        const txHash = hashData(payloadStr);

        const tempPayRef = await adminDb.ref("temporaryPayments").push({
            userId,
            committeeId,
            amount: Number(amount),
            paidBy: req.user.userId,
            note: note ? encryptData(note) : null,
            status: "pending_recovery",
            paidAt: now,
            ledgerHash: txHash,
            ledgerPayload: encryptData(payloadStr),
        });

        // Update committee member payment status
        const commSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
        const comm = commSnap.val();
        if (comm && comm.usersParticipated) {
            const members = Array.isArray(comm.usersParticipated)
                ? [...comm.usersParticipated]
                : Object.values(comm.usersParticipated);
            const idx = members.findIndex(m => (m.userId || m.uid || m.id) === userId);
            if (idx >= 0) {
                members[idx] = { ...members[idx], paymentStatus: "Paid", paidByAdmin: true, adminPaymentId: tempPayRef.key };
                await adminDb.ref(`committees/${committeeId}/usersParticipated`).set(members);
            }
        }

        // FR-81: Notify the user that admin paid on their behalf
        await pushNotif(userId,
            "Admin Paid on Your Behalf",
            `Admin has temporarily paid Rs ${amount} for your committee dues. This amount will be recovered from you.`,
            "warning", committeeId);

        // FR-74/71: Notify admins of suspicious/temporary payment
        const adminSnap = await adminDb.ref("users").orderByChild("role").equalTo("admin").once("value");
        const admins = adminSnap.val() || {};
        await Promise.all(Object.keys(admins).filter(id => id !== req.user.userId).map(adminId =>
            pushNotif(adminId, "Temporary Payment Made",
                `Admin paid Rs ${amount} on behalf of user ${userId} in committee ${committeeId}.`, "info", committeeId)));

        await logEvent("ADMIN_TEMP_PAYMENT", req.user.userId, { userId, committeeId, amount, tempPayId: tempPayRef.key, ledgerHash: txHash, ip: req.ip });
        return res.json({ success: true, tempPaymentId: tempPayRef.key, ledgerHash: txHash });
    } catch (err) {
        console.error("[Warning/AdminPay]", err);
        return res.status(500).json({ error: "Admin payment failed" });
    }
});

// ─── FR-84: Recover Admin-Paid Amount from User ─────────
// POST /api/warning/recover
router.post("/recover", verifyToken, verifyRole("admin"), async (req, res) => {
    try {
        const { tempPaymentId, recoveryNote } = req.body;
        if (!tempPaymentId) return res.status(400).json({ error: "tempPaymentId required" });

        const snap = await adminDb.ref(`temporaryPayments/${tempPaymentId}`).once("value");
        const tempPay = snap.val();
        if (!tempPay) return res.status(404).json({ error: "Temporary payment not found" });
        if (tempPay.status === "recovered") return res.status(400).json({ error: "Already recovered" });

        const now = new Date().toISOString();
        await adminDb.ref(`temporaryPayments/${tempPaymentId}`).update({
            status: "recovered",
            recoveredAt: now,
            recoveredBy: req.user.userId,
            recoveryNote: recoveryNote ? encryptData(recoveryNote) : null,
        });

        await pushNotif(tempPay.userId,
            "Recovery Notice",
            `Rs ${tempPay.amount} owed to admin for temporary payment has been recorded as recovered.`,
            "info", tempPay.committeeId);

        await logEvent("ADMIN_PAYMENT_RECOVERED", req.user.userId, { tempPaymentId, userId: tempPay.userId, amount: tempPay.amount, ip: req.ip });
        return res.json({ success: true, recovered: tempPay.amount });
    } catch (err) {
        console.error("[Warning/Recover]", err);
        return res.status(500).json({ error: "Recovery failed" });
    }
});

// ─── Get all temporary payments ──────────────────────────
// GET /api/warning/admin-payments?userId=&status=
router.get("/admin-payments", verifyToken, verifyRole("admin"), async (req, res) => {
    try {
        const { userId, status } = req.query;
        const snap = await adminDb.ref("temporaryPayments").once("value");
        const all = snap.val() || {};
        let payments = Object.entries(all).map(([id, p]) => ({ id, ...p, note: safeDecrypt(p.note) }));
        if (userId) payments = payments.filter(p => p.userId === userId);
        if (status) payments = payments.filter(p => p.status === status);
        return res.json({ success: true, payments });
    } catch (err) {
        console.error("[Warning/AdminPayments]", err);
        return res.status(500).json({ error: "Failed to fetch" });
    }
});

module.exports = router;
