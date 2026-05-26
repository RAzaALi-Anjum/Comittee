// ============================================================
// Loan Routes — FR-98,99,100,101,103,104,105
// Eligibility, Terms, Disburse, Repay, Monitor, Recover
// ============================================================
const express = require("express");
const { encryptData, decryptData, hashData } = require("../utils/encryption");
const { adminDb } = require("../utils/firebaseAdmin");
const { verifyToken, verifyRole } = require("../middleware/auth");
const { logEvent } = require("../utils/auditLogger");
const router = express.Router();

function safeDecrypt(val) { try { return val ? decryptData(val) : val; } catch { return val; } }

async function pushNotif(userId, title, message, type) {
    try {
        await adminDb.ref(`notifications/${userId}`).push({
            title: encryptData(title), message: encryptData(message),
            type, createdAt: new Date().toISOString(), read: false, sentBy: "system",
        });
    } catch (e) { console.warn("[Loan/Notif]", e.message); }
}

// Defaults
const LOAN_LIMIT_PER_LEVEL = 10000; // Rs per level
const LEVEL_UP_COMMITTEES = 3;

// ─── FR-98: Calculate Loan Eligibility ──────────────────
// GET /api/loan/eligibility/:userId
router.get("/eligibility/:userId", verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        if (req.user.userId !== userId && req.user.role !== "admin")
            return res.status(403).json({ error: "Access denied" });

        const userSnap = await adminDb.ref(`users/${userId}`).once("value");
        const user = userSnap.val();
        if (!user) return res.status(404).json({ error: "User not found" });

        const level = user.initiatorLevel || 1;
        const maxLoanAmount = level * LOAN_LIMIT_PER_LEVEL;

        // Check existing unpaid loans
        const loanSnap = await adminDb.ref("loans").orderByChild("applicantId").equalTo(userId).once("value");
        const loans = loanSnap.val() || {};
        const hasUnpaidLoan = Object.values(loans).some(l => l.status === "disbursed" && !l.repaidAt);

        // Count completed committees for rating
        const commSnap = await adminDb.ref("committees").once("value");
        const allComm = commSnap.val() || {};
        const completedCount = Object.values(allComm).filter(c => {
            const participated = Array.isArray(c.usersParticipated)
                ? c.usersParticipated.some(m => (m.userId || m.uid || m.id) === userId)
                : false;
            return participated && (c.status === "completed" || c.status === "ended");
        }).length;

        const eligible = !hasUnpaidLoan && level >= 1;

        return res.json({
            success: true,
            eligible,
            level,
            maxLoanAmount,
            completedCommittees: completedCount,
            hasUnpaidLoan,
            reason: !eligible ? (hasUnpaidLoan ? "You have an existing unpaid loan" : "Not eligible") : null,
        });
    } catch (err) {
        console.error("[Loan/Eligibility]", err);
        return res.status(500).json({ error: "Failed to calculate eligibility" });
    }
});

// ─── FR-99: View Loan Terms ──────────────────────────────
// GET /api/loan/terms/:loanId
router.get("/terms/:loanId", verifyToken, async (req, res) => {
    try {
        const { loanId } = req.params;
        const snap = await adminDb.ref(`loans/${loanId}`).once("value");
        const loan = snap.val();
        if (!loan) return res.status(404).json({ error: "Loan not found" });
        if (loan.applicantId !== req.user.userId && req.user.role !== "admin")
            return res.status(403).json({ error: "Access denied" });
        return res.json({
            success: true,
            terms: {
                loanId,
                amount: loan.amount,
                repaymentPeriodDays: loan.repaymentDays || 90,
                interestRate: 0,
                note: "This is an interest-free loan. Full repayment required within the agreed period.",
                approvedAt: loan.approvedAt,
                dueDate: loan.dueDate,
                status: loan.status,
            },
        });
    } catch (err) {
        console.error("[Loan/Terms]", err);
        return res.status(500).json({ error: "Failed to fetch terms" });
    }
});

// ─── FR-100: Disburse Approved Loan ─────────────────────
// POST /api/loan/disburse
router.post("/disburse", verifyToken, verifyRole("admin"), async (req, res) => {
    try {
        const { loanId } = req.body;
        if (!loanId) return res.status(400).json({ error: "loanId required" });
        const snap = await adminDb.ref(`loans/${loanId}`).once("value");
        const loan = snap.val();
        if (!loan) return res.status(404).json({ error: "Loan not found" });
        if (loan.status !== "approved") return res.status(400).json({ error: `Loan is ${loan.status}, not approved` });

        const now = new Date();
        const dueDate = new Date(now);
        dueDate.setDate(now.getDate() + (loan.repaymentDays || 90));

        await adminDb.ref(`loans/${loanId}`).update({
            status: "disbursed",
            disbursedAt: now.toISOString(),
            disbursedBy: req.user.userId,
            dueDate: dueDate.toISOString().split("T")[0],
        });

        // FR-70: Notify applicant
        await pushNotif(loan.applicantId,
            "Loan Disbursed ✅",
            `Your loan of Rs ${loan.amount} has been disbursed. Repayment due by ${dueDate.toISOString().split("T")[0]}.`,
            "success");

        await logEvent("LOAN_DISBURSED", req.user.userId, { loanId, applicantId: loan.applicantId, amount: loan.amount, ip: req.ip });
        return res.json({ success: true, status: "disbursed", dueDate: dueDate.toISOString().split("T")[0] });
    } catch (err) {
        console.error("[Loan/Disburse]", err);
        return res.status(500).json({ error: "Disbursement failed" });
    }
});

// ─── FR-101: Repay Loan ──────────────────────────────────
// POST /api/loan/repay
router.post("/repay", verifyToken, async (req, res) => {
    try {
        const { loanId, amount } = req.body;
        if (!loanId || !amount) return res.status(400).json({ error: "loanId and amount required" });
        const snap = await adminDb.ref(`loans/${loanId}`).once("value");
        const loan = snap.val();
        if (!loan) return res.status(404).json({ error: "Loan not found" });
        if (loan.applicantId !== req.user.userId && req.user.role !== "admin")
            return res.status(403).json({ error: "Access denied" });
        if (loan.status !== "disbursed") return res.status(400).json({ error: "Loan is not in disbursed state" });

        const now = new Date().toISOString();
        const payloadStr = JSON.stringify({ loanId, amount: Number(amount), repaidBy: req.user.userId, timestamp: now });
        const repayHash = hashData(payloadStr);

        await adminDb.ref(`loans/${loanId}`).update({
            status: "repaid",
            repaidAt: now,
            repaidAmount: Number(amount),
            repaymentHash: repayHash,
            repaymentLedgerPayload: encryptData(payloadStr),
        });

        await pushNotif(loan.applicantId, "Loan Repaid", `Your loan repayment of Rs ${amount} has been recorded.`, "success");

        await logEvent("LOAN_REPAID", req.user.userId, { loanId, amount, repayHash, ip: req.ip });
        return res.json({ success: true, status: "repaid", repaymentHash: repayHash });
    } catch (err) {
        console.error("[Loan/Repay]", err);
        return res.status(500).json({ error: "Repayment failed" });
    }
});

// ─── FR-103: Admin Approve/Reject Loan ──────────────────
// POST /api/loan/review
router.post("/review", verifyToken, verifyRole("admin"), async (req, res) => {
    try {
        const { loanId, action, reason } = req.body;
        if (!loanId || !["approve", "reject"].includes(action))
            return res.status(400).json({ error: "loanId and action (approve/reject) required" });
        const snap = await adminDb.ref(`loans/${loanId}`).once("value");
        const loan = snap.val();
        if (!loan) return res.status(404).json({ error: "Loan not found" });
        if (loan.status !== "pending") return res.status(400).json({ error: `Loan is already ${loan.status}` });

        const newStatus = action === "approve" ? "approved" : "rejected";
        await adminDb.ref(`loans/${loanId}`).update({
            status: newStatus,
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.user.userId,
            reviewReason: reason ? encryptData(reason) : null,
        });

        // FR-70: Notify applicant
        await pushNotif(loan.applicantId,
            `Loan ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`,
            `Your loan request of Rs ${loan.amount} has been ${newStatus}.${reason ? " Reason: " + reason : ""}`,
            action === "approve" ? "success" : "warning");

        await logEvent(`LOAN_${action.toUpperCase()}D`, req.user.userId, { loanId, ip: req.ip });
        return res.json({ success: true, status: newStatus });
    } catch (err) {
        console.error("[Loan/Review]", err);
        return res.status(500).json({ error: "Review failed" });
    }
});

// ─── FR-104: Monitor Loan Repayment ─────────────────────
// GET /api/loan/monitor?status=&applicantId=
router.get("/monitor", verifyToken, verifyRole("admin"), async (req, res) => {
    try {
        const { status, applicantId } = req.query;
        const snap = await adminDb.ref("loans").once("value");
        const all = snap.val();
        if (!all) return res.json({ success: true, loans: [] });

        let loans = Object.entries(all).map(([id, l]) => ({
            id, ...l,
            overdue: l.status === "disbursed" && l.dueDate && new Date(l.dueDate) < new Date(),
        }));

        if (status) loans = loans.filter(l => l.status === status);
        if (applicantId) loans = loans.filter(l => l.applicantId === applicantId);

        return res.json({ success: true, count: loans.length, loans });
    } catch (err) {
        console.error("[Loan/Monitor]", err);
        return res.status(500).json({ error: "Monitor failed" });
    }
});

// ─── FR-105: Recover Loan from Bonus/Earnings ───────────
// POST /api/loan/recover-from-earnings
router.post("/recover-from-earnings", verifyToken, verifyRole("admin"), async (req, res) => {
    try {
        const { loanId, initiatorId } = req.body;
        if (!loanId || !initiatorId) return res.status(400).json({ error: "loanId and initiatorId required" });

        const loanSnap = await adminDb.ref(`loans/${loanId}`).once("value");
        const loan = loanSnap.val();
        if (!loan) return res.status(404).json({ error: "Loan not found" });
        if (loan.status !== "disbursed") return res.status(400).json({ error: "Loan is not outstanding" });

        // Check initiator earnings
        const earningsSnap = await adminDb.ref(`earnings/${initiatorId}`).once("value");
        const earnings = earningsSnap.val();
        const balance = earnings?.balance || 0;

        if (balance <= 0) {
            return res.status(400).json({
                error: "No earnings balance available for recovery.",
                available: 0,
                required: loan.amount,
            });
        }

        const now = new Date().toISOString();

        // TC-105-02: Partial recovery — deduct whatever is available
        const deductAmount = Math.min(balance, loan.amount);
        const newBalance = balance - deductAmount;
        const isFullyRecovered = deductAmount >= loan.amount;

        await adminDb.ref(`earnings/${initiatorId}`).update({
            balance: newBalance,
            lastDeductedAt: now,
            lastDeductionReason: encryptData(`Loan recovery for loanId: ${loanId}`),
        });

        await adminDb.ref(`loans/${loanId}`).update({
            status: isFullyRecovered ? "repaid" : "partially_recovered",
            repaidAt: isFullyRecovered ? now : null,
            repaidAmount: deductAmount,
            remainingAmount: isFullyRecovered ? 0 : loan.amount - deductAmount,
            repaidFrom: "earnings",
            recoveredBy: req.user.userId,
            lastRecoveryAt: now,
        });

        const notifMsg = isFullyRecovered
            ? `Rs ${deductAmount} has been recovered from your earnings to fully settle your loan.`
            : `Rs ${deductAmount} has been partially recovered from your earnings. Remaining loan balance: Rs ${loan.amount - deductAmount}.`;

        await pushNotif(initiatorId, isFullyRecovered ? "Loan Recovered from Earnings" : "⚠️ Partial Loan Recovery",
            notifMsg, "warning");

        await logEvent("LOAN_RECOVERED_FROM_EARNINGS", req.user.userId, {
            loanId, initiatorId, deductAmount, isFullyRecovered, remaining: loan.amount - deductAmount, ip: req.ip,
        });
        return res.json({
            success: true,
            recovered: deductAmount,
            isFullyRecovered,
            remaining: isFullyRecovered ? 0 : loan.amount - deductAmount,
            newEarningsBalance: newBalance,
        });
    } catch (err) {
        console.error("[Loan/RecoverFromEarnings]", err);
        return res.status(500).json({ error: "Recovery failed" });
    }
});

// ─── FR-72: Notify overdue loans (callable by scheduler) ─
// POST /api/loan/notify-overdue
router.post("/notify-overdue", verifyToken, verifyRole("admin"), async (req, res) => {
    try {
        const snap = await adminDb.ref("loans").once("value");
        const all = snap.val() || {};
        const now = new Date();
        let notified = 0;

        for (const [, loan] of Object.entries(all)) {
            if (loan.status === "disbursed" && loan.dueDate && new Date(loan.dueDate) < now) {
                await pushNotif(loan.applicantId,
                    "⚠️ Loan Overdue",
                    `Your loan of Rs ${loan.amount} was due on ${loan.dueDate}. Please repay immediately.`,
                    "warning");

                // Also notify all admins
                const adminSnap = await adminDb.ref("users").orderByChild("role").equalTo("admin").once("value");
                const admins = adminSnap.val() || {};
                await Promise.all(Object.keys(admins).map(adminId =>
                    pushNotif(adminId, "Loan Overdue Alert",
                        `Loan of Rs ${loan.amount} by user ${loan.applicantId} is overdue.`, "warning")));
                notified++;
            }
        }
        return res.json({ success: true, notified });
    } catch (err) {
        console.error("[Loan/NotifyOverdue]", err);
        return res.status(500).json({ error: "Notification failed" });
    }
});

module.exports = router;
