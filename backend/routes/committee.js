// ============================================================
// Committee Routes — FR-31,32,36,40,43,44,48,49,54,57,64-66,102
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
    } catch (e) { console.warn("[Notif]", e.message); }
}

async function notifyMembers(committeeId, title, msg, type, excludeId = null) {
    try {
        const snap = await adminDb.ref(`committees/${committeeId}`).once("value");
        const comm = snap.val();
        if (!comm || !comm.usersParticipated) return;
        const members = Array.isArray(comm.usersParticipated)
            ? comm.usersParticipated.filter(Boolean)
            : Object.values(comm.usersParticipated).filter(Boolean);
        const uids = members.map(m => m.userId || m.uid || m.id).filter(uid => uid && uid !== excludeId);
        await Promise.all(uids.map(uid => pushNotif(uid, title, msg, type, committeeId)));
    } catch (e) { console.warn("[NotifyMembers]", e.message); }
}

// FR-31: Lock Committee
router.post("/lock", verifyToken, async (req, res) => {
    try {
        const { committeeId } = req.body;
        if (!committeeId) return res.status(400).json({ error: "committeeId required" });
        const snap = await adminDb.ref(`committees/${committeeId}`).once("value");
        const comm = snap.val();
        if (!comm) return res.status(404).json({ error: "Committee not found" });
        if (comm.createdBy !== req.user.userId && req.user.role !== "admin")
            return res.status(403).json({ error: "Access denied" });
        const startDate = comm.startDate ? new Date(comm.startDate) : null;
        if (startDate && new Date() >= startDate)
            return res.status(400).json({ error: "Cannot lock after start date" });
        await adminDb.ref(`committees/${committeeId}`).update({
            locked: true, lockedAt: new Date().toISOString(), lockedBy: req.user.userId,
        });
        await notifyMembers(committeeId, "Committee Locked",
            `${safeDecrypt(comm.name) || "Committee"} has been locked and is ready to begin.`, "info");
        await logEvent("COMMITTEE_LOCKED", req.user.userId, { committeeId, ip: req.ip });
        return res.json({ success: true, message: "Committee locked" });
    } catch (err) {
        console.error("[Committee/Lock]", err);
        return res.status(500).json({ error: "Failed to lock committee" });
    }
});

// FR-32: Auto-generate turns
router.post("/generate-turns", verifyToken, async (req, res) => {
    try {
        const { committeeId } = req.body;
        if (!committeeId) return res.status(400).json({ error: "committeeId required" });
        const snap = await adminDb.ref(`committees/${committeeId}`).once("value");
        const comm = snap.val();
        if (!comm) return res.status(404).json({ error: "Committee not found" });
        if (comm.createdBy !== req.user.userId && req.user.role !== "admin")
            return res.status(403).json({ error: "Access denied" });
        const members = Array.isArray(comm.usersParticipated)
            ? comm.usersParticipated.filter(Boolean)
            : Object.values(comm.usersParticipated || {}).filter(Boolean);
        if (!members.length) return res.status(400).json({ error: "No members in committee" });

        // Fisher-Yates shuffle
        const shuffled = [...members];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const startDate = comm.startDate ? new Date(comm.startDate) : new Date();
        const cycleDays = comm.cycleDuration || 30;
        const turns = shuffled.map((m, idx) => {
            const td = new Date(startDate);
            td.setDate(startDate.getDate() + idx * cycleDays);
            return {
                turnNumber: idx + 1,
                userId: m.userId || m.uid || m.id,
                userName: m.userName || m.name || "",
                scheduledDate: td.toISOString().split("T")[0],
                status: "pending",
                assignedAt: new Date().toISOString(),
            };
        });
        const payload = JSON.stringify(turns);
        const turnsHash = hashData(payload);
        await adminDb.ref(`committees/${committeeId}`).update({
            turns, turnsHash,
            turnsGeneratedAt: new Date().toISOString(),
            turnsLedgerPayload: encryptData(payload),
        });
        // FR-65/66: Notify each member their turn
        const commName = safeDecrypt(comm.name) || "committee";
        await Promise.all(turns.map(t => pushNotif(t.userId,
            "Your Turn Assigned",
            `Your turn for ${commName} is #${t.turnNumber} on ${t.scheduledDate}.`,
            "turn", committeeId)));
        await logEvent("TURNS_GENERATED", req.user.userId, { committeeId, count: turns.length, ip: req.ip });
        return res.json({ success: true, turns, turnsHash });
    } catch (err) {
        console.error("[Committee/GenerateTurns]", err);
        return res.status(500).json({ error: "Failed to generate turns" });
    }
});

// FR-36: Admin approve/reject committee
router.post("/approve", verifyToken, verifyRole("admin"), async (req, res) => {
    try {
        const { committeeId, action, reason } = req.body;
        if (!committeeId || !["approve", "reject"].includes(action))
            return res.status(400).json({ error: "committeeId and action required" });
        const snap = await adminDb.ref(`committees/${committeeId}`).once("value");
        const comm = snap.val();
        if (!comm) return res.status(404).json({ error: "Committee not found" });
        const newStatus = action === "approve" ? "approved" : "rejected";
        await adminDb.ref(`committees/${committeeId}`).update({
            adminStatus: newStatus, adminReviewedAt: new Date().toISOString(),
            adminReviewedBy: req.user.userId,
            adminReason: reason ? encryptData(reason) : null,
        });
        if (comm.createdBy) {
            await pushNotif(comm.createdBy,
                `Committee ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`,
                `Your committee has been ${newStatus} by admin.${reason ? " Reason: " + reason : ""}`,
                action === "approve" ? "success" : "warning", committeeId);
        }
        await logEvent(`COMMITTEE_${action.toUpperCase()}D`, req.user.userId, { committeeId, ip: req.ip });
        return res.json({ success: true, status: newStatus });
    } catch (err) {
        console.error("[Committee/Approve]", err);
        return res.status(500).json({ error: "Failed to update committee status" });
    }
});

// FR-40: Check payout eligibility (unpaid dues block)
router.get("/can-receive-payout", verifyToken, async (req, res) => {
    try {
        const { userId, committeeId } = req.query;
        if (!userId || !committeeId) return res.status(400).json({ error: "userId and committeeId required" });
        const snap = await adminDb.ref(`committees/${committeeId}`).once("value");
        const comm = snap.val();
        if (!comm) return res.status(404).json({ error: "Committee not found" });
        const members = Array.isArray(comm.usersParticipated)
            ? comm.usersParticipated.filter(Boolean)
            : Object.values(comm.usersParticipated || {}).filter(Boolean);
        const member = members.find(m => (m.userId || m.uid || m.id) === userId);
        if (!member) return res.status(404).json({ error: "Member not found" });
        const unpaid = member.paymentStatus !== "Paid";
        return res.json({ success: true, canReceivePayout: !unpaid, reason: unpaid ? "Unpaid dues exist" : null });
    } catch (err) {
        console.error("[Committee/CanPayout]", err);
        return res.status(500).json({ error: "Check failed" });
    }
});

// FR-43 + FR-44: Distribute payout with blockchain hash
router.post("/payout", verifyToken, async (req, res) => {
    try {
        const { committeeId, recipientUserId, amount, note } = req.body;
        if (!committeeId || !recipientUserId || !amount)
            return res.status(400).json({ error: "committeeId, recipientUserId, amount required" });
        const snap = await adminDb.ref(`committees/${committeeId}`).once("value");
        const comm = snap.val();
        if (!comm) return res.status(404).json({ error: "Committee not found" });
        if (comm.createdBy !== req.user.userId && req.user.role !== "admin")
            return res.status(403).json({ error: "Access denied" });
        const members = Array.isArray(comm.usersParticipated)
            ? comm.usersParticipated.filter(Boolean)
            : Object.values(comm.usersParticipated || {}).filter(Boolean);
        const recipient = members.find(m => (m.userId || m.uid || m.id) === recipientUserId);
        // FR-40: Block if unpaid dues
        if (recipient && recipient.paymentStatus !== "Paid")
            return res.status(400).json({ error: "Recipient has unpaid dues. Cannot disburse payout.", code: "UNPAID_DUES" });
        const walletSnap = await adminDb.ref(`wallets/${committeeId}`).once("value");
        const wallet = walletSnap.val();
        const balance = wallet?.balance || 0;
        if (balance < Number(amount))
            return res.status(400).json({ error: `Insufficient wallet balance. Available: Rs ${balance}` });
        const now = new Date().toISOString();
        const payloadStr = JSON.stringify({ committeeId, recipientUserId, amount: Number(amount), timestamp: now, issuedBy: req.user.userId });
        const payoutHash = hashData(payloadStr);
        const payoutRef = await adminDb.ref("payouts").push({
            committeeId, recipientUserId, amount: Number(amount),
            issuedBy: req.user.userId, note: note ? encryptData(note) : null,
            status: "disbursed", createdAt: now,
            ledgerHash: payoutHash, ledgerPayload: encryptData(payloadStr),
        });
        const newBalance = balance - Number(amount);
        await adminDb.ref(`wallets/${committeeId}`).update({
            balance: newBalance, totalDebits: (wallet?.totalDebits || 0) + Number(amount), lastUpdated: now,
        });
        await adminDb.ref(`walletTransactions/${committeeId}`).push({
            type: "debit", amount: Number(amount), userId: recipientUserId,
            payoutId: payoutRef.key, description: encryptData("Committee payout"),
            date: now, balanceAfter: newBalance, ledgerHash: payoutHash,
        });
        const memberIdx = members.findIndex(m => (m.userId || m.uid || m.id) === recipientUserId);
        if (memberIdx >= 0) {
            members[memberIdx] = { ...members[memberIdx], payoutReceived: true, payoutDate: now };
            await adminDb.ref(`committees/${committeeId}/usersParticipated`).set(members);
        }
        await pushNotif(recipientUserId, "Payout Disbursed 🎉",
            `Rs ${amount} has been disbursed from ${safeDecrypt(comm.name) || "the committee"}.`,
            "payment", committeeId);
        await logEvent("PAYOUT_DISBURSED", req.user.userId, { committeeId, recipientUserId, amount, ledgerHash: payoutHash, ip: req.ip });
        return res.json({ success: true, payoutId: payoutRef.key, ledgerHash: payoutHash, newWalletBalance: newBalance });
    } catch (err) {
        console.error("[Committee/Payout]", err);
        return res.status(500).json({ error: "Payout failed" });
    }
});

// FR-102: Check loan block for committee creation
router.get("/loan-block/:initiatorId", verifyToken, async (req, res) => {
    try {
        const { initiatorId } = req.params;
        const snap = await adminDb.ref("loans").orderByChild("applicantId").equalTo(initiatorId).once("value");
        const loans = snap.val();
        if (!loans) return res.json({ blocked: false });
        const hasUnpaid = Object.values(loans).some(l => l.status === "disbursed" && !l.repaidAt);
        return res.json({ blocked: hasUnpaid, reason: hasUnpaid ? "Unpaid loans exist. Repay before creating a committee." : null });
    } catch (err) {
        console.error("[Committee/LoanBlock]", err);
        return res.status(500).json({ error: "Failed to check loan status" });
    }
});

// FR-48/49/54/57: Search & filter committees
router.get("/search", verifyToken, async (req, res) => {
    try {
        const { name, minAmount, maxAmount, status, adminStatus } = req.query;
        const snap = await adminDb.ref("committees").once("value");
        const all = snap.val();
        if (!all) return res.json({ success: true, committees: [] });
        let results = Object.entries(all).map(([id, c]) => ({
            id, ...c, name: safeDecrypt(c.name) || c.name,
        }));
        if (name) results = results.filter(c => (c.name || "").toLowerCase().includes(name.toLowerCase()));
        if (minAmount) results = results.filter(c => Number(c.contributionAmount || 0) >= Number(minAmount));
        if (maxAmount) results = results.filter(c => Number(c.contributionAmount || 0) <= Number(maxAmount));
        if (status) results = results.filter(c => (c.status || "").toLowerCase() === status.toLowerCase());
        if (adminStatus) results = results.filter(c => (c.adminStatus || "").toLowerCase() === adminStatus.toLowerCase());
        results = results.map(c => ({
            id: c.id, name: c.name, contributionAmount: c.contributionAmount,
            status: c.status, adminStatus: c.adminStatus || "pending",
            memberCount: Array.isArray(c.usersParticipated) ? c.usersParticipated.filter(Boolean).length : 0,
            startDate: c.startDate, locked: c.locked || false, createdBy: c.createdBy,
        }));
        return res.json({ success: true, count: results.length, committees: results });
    } catch (err) {
        console.error("[Committee/Search]", err);
        return res.status(500).json({ error: "Search failed" });
    }
});

// Get payouts history
router.get("/payouts", verifyToken, async (req, res) => {
    try {
        const { committeeId, userId } = req.query;
        const ref = committeeId
            ? adminDb.ref("payouts").orderByChild("committeeId").equalTo(committeeId)
            : adminDb.ref("payouts");
        const snap = await ref.once("value");
        const all = snap.val();
        if (!all) return res.json({ success: true, payouts: [] });
        let payouts = Object.entries(all).map(([id, p]) => ({ id, ...p, note: safeDecrypt(p.note) }));
        if (userId) payouts = payouts.filter(p => p.recipientUserId === userId);
        return res.json({ success: true, payouts });
    } catch (err) {
        console.error("[Committee/Payouts]", err);
        return res.status(500).json({ error: "Failed to fetch payouts" });
    }
});

// FR-57: Filter committees by payment status (admin)
router.get("/by-payment-status", verifyToken, verifyRole("admin"), async (req, res) => {
    try {
        const { paymentStatus } = req.query;
        const snap = await adminDb.ref("committees").once("value");
        const all = snap.val();
        if (!all) return res.json({ success: true, committees: [] });
        const results = Object.entries(all)
            .map(([id, c]) => {
                const members = Array.isArray(c.usersParticipated)
                    ? c.usersParticipated.filter(Boolean)
                    : Object.values(c.usersParticipated || {}).filter(Boolean);
                const unpaidCount = members.filter(m => m.paymentStatus !== "Paid").length;
                const allPaid = unpaidCount === 0 && members.length > 0;
                return {
                    id, name: safeDecrypt(c.name) || c.name, status: c.status,
                    totalMembers: members.length,
                    paidMembers: members.length - unpaidCount,
                    unpaidMembers: unpaidCount,
                    paymentStatus: allPaid ? "paid" : "unpaid",
                };
            })
            .filter(c => !paymentStatus || c.paymentStatus === paymentStatus.toLowerCase());
        return res.json({ success: true, count: results.length, committees: results });
    } catch (err) {
        console.error("[Committee/ByPaymentStatus]", err);
        return res.status(500).json({ error: "Filter failed" });
    }
});

// TC-55-01/55-02: Member Withdrawal from Committee
// POST /api/committee/withdraw
router.post("/withdraw", verifyToken, async (req, res) => {
    try {
        const { committeeId } = req.body;
        const userId = req.user.userId;
        if (!committeeId) return res.status(400).json({ error: "committeeId required" });

        const snap = await adminDb.ref(`committees/${committeeId}`).once("value");
        const comm = snap.val();
        if (!comm) return res.status(404).json({ error: "Committee not found" });

        // TC-55-02: Block withdrawal after committee has started
        const started = comm.status === "Started" || comm.status === "Active" || comm.active === true;
        if (started) {
            return res.status(400).json({
                error: "Withdrawal not allowed after committee has started.",
                code: "COMMITTEE_STARTED",
            });
        }

        const members = Array.isArray(comm.usersParticipated)
            ? comm.usersParticipated.filter(Boolean)
            : Object.values(comm.usersParticipated || {}).filter(Boolean);

        const memberIdx = members.findIndex(m => (m.userId || m.uid || m.id) === userId);
        if (memberIdx < 0) return res.status(404).json({ error: "You are not a member of this committee" });

        // TC-55-01: Remove the member
        members.splice(memberIdx, 1);
        await adminDb.ref(`committees/${committeeId}/usersParticipated`).set(members);

        if (comm.createdBy) {
            await pushNotif(comm.createdBy, "Member Withdrew",
                `A member has withdrawn from ${safeDecrypt(comm.name) || "your committee"}.`, "info", committeeId);
        }

        await logEvent("COMMITTEE_WITHDRAWAL", userId, { committeeId, ip: req.ip });
        return res.json({ success: true, message: "Withdrawal successful" });
    } catch (err) {
        console.error("[Committee/Withdraw]", err);
        return res.status(500).json({ error: "Withdrawal failed" });
    }
});

module.exports = router;

