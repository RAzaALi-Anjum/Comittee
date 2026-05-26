// ============================================================
// Turn Adjustment Routes — FR-33, FR-34, FR-35, FR-94, FR-95, FR-96
// Turn requests, priority turns, swap approvals
// ============================================================
const express = require("express");
const { encryptData, decryptData } = require("../utils/encryption");
const { adminDb } = require("../utils/firebaseAdmin");
const { verifyToken } = require("../middleware/auth");
const { logEvent } = require("../utils/auditLogger");
const router = express.Router();

const PRIORITY_TURN_FEE = 500; // Rs (FR-95)

function safeDecrypt(val) { try { return val ? decryptData(val) : val; } catch { return val; } }

async function pushNotif(userId, title, message, type, committeeId = null) {
    try {
        await adminDb.ref(`notifications/${userId}`).push({
            title: encryptData(title), message: encryptData(message),
            type, committeeId, createdAt: new Date().toISOString(), read: false, sentBy: "system",
        });
    } catch (e) { console.warn("[Turn/Notif]", e.message); }
}

// ─── FR-94: User Requests Turn Adjustment ───────────────
// POST /api/turn/request
router.post("/request", verifyToken, async (req, res) => {
    try {
        const { committeeId, requestedTurnNumber, reason } = req.body;
        const userId = req.user.userId;
        if (!committeeId || !requestedTurnNumber) return res.status(400).json({ error: "committeeId and requestedTurnNumber required" });

        const commSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
        const comm = commSnap.val();
        if (!comm) return res.status(404).json({ error: "Committee not found" });

        // Cannot request after start
        const startDate = comm.startDate ? new Date(comm.startDate) : null;
        if (startDate && new Date() > startDate)
            return res.status(400).json({ error: "Cannot request turn adjustment after committee has started (FR-94)" });

        const now = new Date().toISOString();
        const reqRef = await adminDb.ref("turnRequests").push({
            committeeId,
            requesterId: userId,
            requestedTurnNumber: Number(requestedTurnNumber),
            reason: reason ? encryptData(reason) : null,
            type: "adjustment",
            status: "pending",
            createdAt: now,
        });

        // FR-68: Notify initiator
        if (comm.createdBy) {
            await pushNotif(comm.createdBy,
                "Turn Change Request",
                `A member has requested a turn change in ${safeDecrypt(comm.name) || "committee"}.`,
                "info", committeeId);
        }

        await logEvent("TURN_REQUEST_SUBMITTED", userId, { committeeId, requestedTurnNumber, reqId: reqRef.key, ip: req.ip });
        return res.json({ success: true, requestId: reqRef.key, status: "pending" });
    } catch (err) {
        console.error("[Turn/Request]", err);
        return res.status(500).json({ error: "Turn request failed" });
    }
});

// ─── FR-95: Priority Turn Request (Additional Payment) ──
// POST /api/turn/priority-request
router.post("/priority-request", verifyToken, async (req, res) => {
    try {
        const { committeeId, desiredTurnNumber, paymentProof } = req.body;
        const userId = req.user.userId;
        if (!committeeId || !desiredTurnNumber) return res.status(400).json({ error: "committeeId and desiredTurnNumber required" });

        const now = new Date().toISOString();
        const reqRef = await adminDb.ref("turnRequests").push({
            committeeId,
            requesterId: userId,
            requestedTurnNumber: Number(desiredTurnNumber),
            priorityFee: PRIORITY_TURN_FEE,
            paymentProof: paymentProof ? encryptData(paymentProof) : null,
            type: "priority",
            status: "pending",
            createdAt: now,
        });

        const commSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
        const comm = commSnap.val();
        if (comm?.createdBy) {
            await pushNotif(comm.createdBy,
                "Priority Turn Request",
                `A member has paid Rs ${PRIORITY_TURN_FEE} and requested a priority turn #${desiredTurnNumber}.`,
                "info", committeeId);
        }

        await logEvent("PRIORITY_TURN_REQUEST", userId, { committeeId, desiredTurnNumber, reqId: reqRef.key, ip: req.ip });
        return res.json({ success: true, requestId: reqRef.key, priorityFee: PRIORITY_TURN_FEE, status: "pending" });
    } catch (err) {
        console.error("[Turn/PriorityRequest]", err);
        return res.status(500).json({ error: "Priority request failed" });
    }
});

// ─── FR-33/96: Initiator Handles Turn Request ───────────
// POST /api/turn/handle
router.post("/handle", verifyToken, async (req, res) => {
    try {
        const { requestId, action, reason } = req.body;
        if (!requestId || !["approve", "reject"].includes(action))
            return res.status(400).json({ error: "requestId and action (approve/reject) required" });

        const reqSnap = await adminDb.ref(`turnRequests/${requestId}`).once("value");
        const turnReq = reqSnap.val();
        if (!turnReq) return res.status(404).json({ error: "Turn request not found" });

        const commSnap = await adminDb.ref(`committees/${turnReq.committeeId}`).once("value");
        const comm = commSnap.val();
        if (!comm) return res.status(404).json({ error: "Committee not found" });
        if (comm.createdBy !== req.user.userId && req.user.role !== "admin")
            return res.status(403).json({ error: "Only the committee initiator can handle turn requests" });

        const now = new Date().toISOString();
        await adminDb.ref(`turnRequests/${requestId}`).update({
            status: action === "approve" ? "approved" : "rejected",
            reviewedAt: now,
            reviewedBy: req.user.userId,
            reviewReason: reason ? encryptData(reason) : null,
        });

        // FR-35: If priority + approved, swap turns in committee
        if (action === "approve" && comm.turns) {
            const turns = [...comm.turns];
            const requesterIdx = turns.findIndex(t => t.userId === turnReq.requesterId);
            const targetIdx = turns.findIndex(t => t.turnNumber === turnReq.requestedTurnNumber);

            if (requesterIdx >= 0 && targetIdx >= 0) {
                // TC-82-01: Block write if turn is completed/locked
                if (turns[requesterIdx].status === "completed" || turns[requesterIdx].is_locked ||
                    turns[targetIdx].status === "completed" || turns[targetIdx].is_locked) {
                    return res.status(403).json({ error: "Cannot modify a completed turn. Turn history is immutable." });
                }
                // Swap turn numbers
                const tempTurnNum = turns[requesterIdx].turnNumber;
                turns[requesterIdx] = { ...turns[requesterIdx], turnNumber: turns[targetIdx].turnNumber };
                turns[targetIdx] = { ...turns[targetIdx], turnNumber: tempTurnNum };
                turns.sort((a, b) => a.turnNumber - b.turnNumber);
                await adminDb.ref(`committees/${turnReq.committeeId}/turns`).set(turns);
            }
        }

        // Notify requester
        await pushNotif(turnReq.requesterId,
            `Turn Request ${action === "approve" ? "Approved ✅" : "Rejected ❌"}`,
            `Your turn adjustment request has been ${action === "approve" ? "approved" : "rejected"}.${reason ? " Reason: " + reason : ""}`,
            action === "approve" ? "success" : "warning", turnReq.committeeId);

        await logEvent(`TURN_REQUEST_${action.toUpperCase()}D`, req.user.userId, { requestId, committeeId: turnReq.committeeId, ip: req.ip });
        return res.json({ success: true, status: action === "approve" ? "approved" : "rejected" });
    } catch (err) {
        console.error("[Turn/Handle]", err);
        return res.status(500).json({ error: "Handle request failed" });
    }
});

// ─── FR-34: Approve Manual Turn Swap (Mutual Consent) ───
// POST /api/turn/swap
router.post("/swap", verifyToken, async (req, res) => {
    try {
        const { committeeId, user1Id, user2Id } = req.body;
        if (!committeeId || !user1Id || !user2Id)
            return res.status(400).json({ error: "committeeId, user1Id, user2Id required" });

        const commSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
        const comm = commSnap.val();
        if (!comm) return res.status(404).json({ error: "Committee not found" });
        if (comm.createdBy !== req.user.userId && req.user.role !== "admin")
            return res.status(403).json({ error: "Only initiator can approve swaps" });

        if (!comm.turns) return res.status(400).json({ error: "No turns generated yet" });

        const turns = [...comm.turns];
        const idx1 = turns.findIndex(t => t.userId === user1Id);
        const idx2 = turns.findIndex(t => t.userId === user2Id);
        if (idx1 < 0 || idx2 < 0) return res.status(404).json({ error: "One or both users not found in turns" });

        // TC-82-01: Block swap if either turn is completed/locked
        if (turns[idx1].status === "completed" || turns[idx1].is_locked ||
            turns[idx2].status === "completed" || turns[idx2].is_locked) {
            return res.status(403).json({ error: "Cannot swap a completed turn. Turn history is immutable." });
        }

        // Swap turn numbers
        const tempNum = turns[idx1].turnNumber;
        turns[idx1] = { ...turns[idx1], turnNumber: turns[idx2].turnNumber, swappedAt: new Date().toISOString() };
        turns[idx2] = { ...turns[idx2], turnNumber: tempNum, swappedAt: new Date().toISOString() };
        turns.sort((a, b) => a.turnNumber - b.turnNumber);

        await adminDb.ref(`committees/${committeeId}/turns`).set(turns);

        // Notify both users
        await pushNotif(user1Id, "Turn Swapped",
            `Your turn has been swapped with another member in ${safeDecrypt(comm.name) || "the committee"}.`, "info", committeeId);
        await pushNotif(user2Id, "Turn Swapped",
            `Your turn has been swapped with another member in ${safeDecrypt(comm.name) || "the committee"}.`, "info", committeeId);

        await logEvent("TURN_SWAPPED", req.user.userId, { committeeId, user1Id, user2Id, ip: req.ip });
        return res.json({ success: true, message: "Turn swap applied", turns });
    } catch (err) {
        console.error("[Turn/Swap]", err);
        return res.status(500).json({ error: "Turn swap failed" });
    }
});

// ─── Get Turn Requests for a Committee ──────────────────
// GET /api/turn/requests/:committeeId
router.get("/requests/:committeeId", verifyToken, async (req, res) => {
    try {
        const { committeeId } = req.params;
        const snap = await adminDb.ref("turnRequests").orderByChild("committeeId").equalTo(committeeId).once("value");
        const all = snap.val() || {};
        const requests = Object.entries(all).map(([id, r]) => ({
            id, ...r, reason: safeDecrypt(r.reason), reviewReason: safeDecrypt(r.reviewReason),
        }));
        return res.json({ success: true, requests });
    } catch (err) {
        console.error("[Turn/Requests]", err);
        return res.status(500).json({ error: "Failed to fetch requests" });
    }
});

// ─── TC-83-02: Block DELETE on Turn History ─────────────
// DELETE /api/turn/history/:committeeId — always returns 405
router.delete("/history/:committeeId", verifyToken, (req, res) => {
    return res.status(405).json({ error: "Method Not Allowed. Turn history records are immutable and cannot be deleted." });
});

// ─── Mark a Turn as Completed / Locked ──────────────────
// PATCH /api/turn/complete
router.patch("/complete", verifyToken, async (req, res) => {
    try {
        const { committeeId, turnNumber } = req.body;
        if (!committeeId || !turnNumber) return res.status(400).json({ error: "committeeId and turnNumber required" });

        const commSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
        const comm = commSnap.val();
        if (!comm) return res.status(404).json({ error: "Committee not found" });
        if (comm.createdBy !== req.user.userId && req.user.role !== "admin")
            return res.status(403).json({ error: "Only initiator can mark turns complete" });

        if (!comm.turns) return res.status(400).json({ error: "No turns exist" });
        const turns = [...comm.turns];
        const idx = turns.findIndex(t => t.turnNumber === Number(turnNumber));
        if (idx < 0) return res.status(404).json({ error: "Turn not found" });

        if (turns[idx].status === "completed" || turns[idx].is_locked)
            return res.status(400).json({ error: "Turn is already completed" });

        // TC-82-01: Set is_locked = TRUE on completion
        turns[idx] = { ...turns[idx], status: "completed", is_locked: true, completedAt: new Date().toISOString() };
        await adminDb.ref(`committees/${committeeId}/turns`).set(turns);

        await logEvent("TURN_COMPLETED", req.user.userId, { committeeId, turnNumber, ip: req.ip });
        return res.json({ success: true, message: "Turn marked completed and locked", is_locked: true });
    } catch (err) {
        console.error("[Turn/Complete]", err);
        return res.status(500).json({ error: "Failed to complete turn" });
    }
});

// ─── Get Turns for a Committee ──────────────────────────
// GET /api/turn/:committeeId
router.get("/:committeeId", verifyToken, async (req, res) => {
    try {
        const { committeeId } = req.params;
        const snap = await adminDb.ref(`committees/${committeeId}/turns`).once("value");
        const turns = snap.val();
        return res.json({ success: true, turns: turns || [] });
    } catch (err) {
        console.error("[Turn/Get]", err);
        return res.status(500).json({ error: "Failed to fetch turns" });
    }
});

// ============================================================
// TURN SWAP MULTI-LEVEL APPROVAL WORKFLOW
// Status Flow:
//   PENDING_INITIATOR_APPROVAL → PENDING_PAYMENT
//   → PENDING_ADMIN_VERIFICATION → COMPLETED / PAYMENT_REJECTED / REJECTED
// ============================================================

const SWAP_FEE = 500; // Rs — fixed fee for turn swaps

// ─── Step 1: User submits swap request ──────────────────
// POST /api/turn/swap-request
router.post("/swap-request", verifyToken, async (req, res) => {
    try {
        const { committeeId, toUserId, reason } = req.body;
        const fromUserId = req.user.userId;

        if (!committeeId || !toUserId)
            return res.status(400).json({ error: "committeeId and toUserId are required" });
        if (fromUserId === toUserId)
            return res.status(400).json({ error: "Cannot swap turn with yourself" });

        // Validate committee and both users exist in it
        const commSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
        const comm = commSnap.val();
        if (!comm) return res.status(404).json({ error: "Committee not found" });

        const members = Array.isArray(comm.usersParticipated)
            ? comm.usersParticipated.filter(Boolean)
            : Object.values(comm.usersParticipated || {}).filter(Boolean);

        const fromMember = members.find(m => (m.userId || m.uid || m.id) === fromUserId);
        const toMember = members.find(m => (m.userId || m.uid || m.id) === toUserId);
        if (!fromMember) return res.status(404).json({ error: "You are not a member of this committee" });
        if (!toMember) return res.status(404).json({ error: "Target user is not a member of this committee" });

        // Check committee is started
        const isStarted = String(comm.status || "").toLowerCase() === "started" || comm.active === true;
        if (!isStarted)
            return res.status(400).json({ error: "Turn swaps can only be requested after committee has started" });

        // Block if either turn is completed/locked
        if (Array.isArray(comm.turns)) {
            const fromTurn = comm.turns.find(t => t && (t.userId || t.uid) === fromUserId);
            const toTurn = comm.turns.find(t => t && (t.userId || t.uid) === toUserId);
            if (fromTurn?.status === "completed" || fromTurn?.is_locked)
                return res.status(403).json({ error: "Your turn is already completed and cannot be swapped" });
            if (toTurn?.status === "completed" || toTurn?.is_locked)
                return res.status(403).json({ error: "Target user's turn is already completed and cannot be swapped" });
        }

        // Check for existing pending swap for this user in this committee
        const existingSnap = await adminDb.ref("turnSwapRequests")
            .orderByChild("fromUserId").equalTo(fromUserId).once("value");
        const existing = existingSnap.val();
        if (existing) {
            const hasPending = Object.values(existing).some(r =>
                r.committeeId === committeeId &&
                ["PENDING_INITIATOR_APPROVAL", "PENDING_PAYMENT", "PENDING_ADMIN_VERIFICATION"].includes(r.status)
            );
            if (hasPending)
                return res.status(400).json({ error: "You already have a pending swap request for this committee" });
        }

        const now = new Date().toISOString();
        const reqRef = await adminDb.ref("turnSwapRequests").push({
            committeeId,
            fromUserId,
            toUserId,
            reason: reason ? encryptData(reason) : null,
            status: "PENDING_INITIATOR_APPROVAL",
            amount: SWAP_FEE,
            paymentMethod: null,
            paymentScreenshot: null,
            createdAt: now,
            initiatorReviewedAt: null,
            initiatorReviewedBy: null,
            paymentSubmittedAt: null,
            adminReviewedAt: null,
            adminReviewedBy: null,
            completedAt: null,
        });

        // Notify committee initiator
        if (comm.createdBy) {
            const commName = safeDecrypt(comm.name) || "committee";
            await pushNotif(
                comm.createdBy,
                "New Turn Swap Request ⇄",
                `A member has requested a turn swap in ${commName}. Please review and approve or reject.`,
                "info",
                committeeId
            );
        }

        await logEvent("TURN_SWAP_REQUESTED", fromUserId, {
            committeeId, toUserId, requestId: reqRef.key, ip: req.ip
        });

        return res.json({
            success: true,
            requestId: reqRef.key,
            status: "PENDING_INITIATOR_APPROVAL",
            message: "Swap request submitted. Waiting for initiator approval."
        });
    } catch (err) {
        console.error("[Turn/SwapRequest]", err);
        return res.status(500).json({ error: "Failed to submit swap request" });
    }
});

// ─── Step 2: Initiator approves / rejects swap request ──
// POST /api/turn/swap-initiator-handle
router.post("/swap-initiator-handle", verifyToken, async (req, res) => {
    try {
        const { requestId, action, reason } = req.body;
        if (!requestId || !["approve", "reject"].includes(action))
            return res.status(400).json({ error: "requestId and action (approve/reject) required" });

        const reqSnap = await adminDb.ref(`turnSwapRequests/${requestId}`).once("value");
        const swapReq = reqSnap.val();
        if (!swapReq) return res.status(404).json({ error: "Swap request not found" });
        if (swapReq.status !== "PENDING_INITIATOR_APPROVAL")
            return res.status(400).json({ error: `Cannot act on a request with status: ${swapReq.status}` });

        // Verify caller is the committee initiator
        const commSnap = await adminDb.ref(`committees/${swapReq.committeeId}`).once("value");
        const comm = commSnap.val();
        if (!comm) return res.status(404).json({ error: "Committee not found" });
        if (comm.createdBy !== req.user.userId && req.user.role !== "admin")
            return res.status(403).json({ error: "Only the committee initiator can handle swap requests" });

        const now = new Date().toISOString();
        const newStatus = action === "approve" ? "PENDING_PAYMENT" : "REJECTED";

        await adminDb.ref(`turnSwapRequests/${requestId}`).update({
            status: newStatus,
            initiatorReviewedAt: now,
            initiatorReviewedBy: req.user.userId,
            initiatorReason: reason ? encryptData(reason) : null,
        });

        const commName = safeDecrypt(comm.name) || "committee";

        if (action === "approve") {
            // Notify requester (User A) to proceed to payment
            await pushNotif(
                swapReq.fromUserId,
                "Swap Approved by Initiator ✅",
                `Your turn swap request in ${commName} has been approved! Please submit your payment of Rs ${swapReq.amount || SWAP_FEE} to proceed.`,
                "success",
                swapReq.committeeId
            );
        } else {
            // Notify both users of rejection
            await pushNotif(
                swapReq.fromUserId,
                "Swap Request Rejected ❌",
                `Your turn swap request in ${commName} was rejected by the initiator.${reason ? " Reason: " + reason : ""}`,
                "warning",
                swapReq.committeeId
            );
            await pushNotif(
                swapReq.toUserId,
                "Swap Request Cancelled",
                `A turn swap request involving you in ${commName} has been rejected.`,
                "info",
                swapReq.committeeId
            );
        }

        await logEvent(
            `TURN_SWAP_INITIATOR_${action.toUpperCase()}D`,
            req.user.userId,
            { requestId, committeeId: swapReq.committeeId, ip: req.ip }
        );

        return res.json({ success: true, status: newStatus });
    } catch (err) {
        console.error("[Turn/SwapInitiatorHandle]", err);
        return res.status(500).json({ error: "Failed to handle swap request" });
    }
});

// ─── Step 3: User submits payment proof ─────────────────
// POST /api/turn/swap-submit-payment
router.post("/swap-submit-payment", verifyToken, async (req, res) => {
    try {
        const { requestId, paymentMethod, paymentScreenshot } = req.body;
        if (!requestId || !paymentMethod || !paymentScreenshot)
            return res.status(400).json({ error: "requestId, paymentMethod, and paymentScreenshot are required" });

        const reqSnap = await adminDb.ref(`turnSwapRequests/${requestId}`).once("value");
        const swapReq = reqSnap.val();
        if (!swapReq) return res.status(404).json({ error: "Swap request not found" });
        if (swapReq.fromUserId !== req.user.userId)
            return res.status(403).json({ error: "Only the requesting user can submit payment" });
        if (swapReq.status !== "PENDING_PAYMENT")
            return res.status(400).json({ error: `Cannot submit payment for request with status: ${swapReq.status}` });

        const now = new Date().toISOString();
        await adminDb.ref(`turnSwapRequests/${requestId}`).update({
            status: "PENDING_ADMIN_VERIFICATION",
            paymentMethod,
            paymentScreenshot: encryptData(paymentScreenshot),
            paymentSubmittedAt: now,
        });

        // Notify admin (all admins via a global admin notification path)
        await adminDb.ref("adminNotifications").push({
            title: encryptData("Turn Swap Payment Pending"),
            message: encryptData(`A turn swap payment of Rs ${swapReq.amount || SWAP_FEE} is pending verification. Request ID: ${requestId}`),
            type: "swap_payment",
            requestId,
            committeeId: swapReq.committeeId,
            createdAt: now,
            read: false,
        });

        await logEvent("TURN_SWAP_PAYMENT_SUBMITTED", req.user.userId, {
            requestId, committeeId: swapReq.committeeId, paymentMethod, ip: req.ip
        });

        return res.json({
            success: true,
            status: "PENDING_ADMIN_VERIFICATION",
            message: "Payment submitted. Waiting for admin verification."
        });
    } catch (err) {
        console.error("[Turn/SwapSubmitPayment]", err);
        return res.status(500).json({ error: "Failed to submit payment proof" });
    }
});

// ─── Step 4: Admin verifies payment + executes swap ─────
// POST /api/turn/swap-admin-verify
router.post("/swap-admin-verify", verifyToken, async (req, res) => {
    try {
        const { requestId, action } = req.body;
        if (!requestId || !["approve", "reject"].includes(action))
            return res.status(400).json({ error: "requestId and action (approve/reject) required" });
        if (req.user.role !== "admin")
            return res.status(403).json({ error: "Only admin can verify swap payments" });

        const reqSnap = await adminDb.ref(`turnSwapRequests/${requestId}`).once("value");
        const swapReq = reqSnap.val();
        if (!swapReq) return res.status(404).json({ error: "Swap request not found" });
        if (swapReq.status !== "PENDING_ADMIN_VERIFICATION")
            return res.status(400).json({ error: `Cannot act on request with status: ${swapReq.status}` });

        const commSnap = await adminDb.ref(`committees/${swapReq.committeeId}`).once("value");
        const comm = commSnap.val();
        if (!comm) return res.status(404).json({ error: "Committee not found" });

        const now = new Date().toISOString();

        if (action === "approve") {
            // 1. Validate turns still exist and are not locked
            if (!comm.turns)
                return res.status(400).json({ error: "No turns found in committee" });

            const turns = [...comm.turns];
            const fromIdx = turns.findIndex(t => t && (t.userId || t.uid) === swapReq.fromUserId);
            const toIdx = turns.findIndex(t => t && (t.userId || t.uid) === swapReq.toUserId);

            if (fromIdx < 0 || toIdx < 0)
                return res.status(404).json({ error: "One or both users not found in turn list" });
            if (turns[fromIdx].status === "completed" || turns[fromIdx].is_locked)
                return res.status(403).json({ error: "Cannot swap: requesting user's turn is already completed" });
            if (turns[toIdx].status === "completed" || turns[toIdx].is_locked)
                return res.status(403).json({ error: "Cannot swap: target user's turn is already completed" });

            // 2. Swap turn numbers
            const tempTurnNum = turns[fromIdx].turnNumber;
            turns[fromIdx] = { ...turns[fromIdx], turnNumber: turns[toIdx].turnNumber, swappedAt: now };
            turns[toIdx] = { ...turns[toIdx], turnNumber: tempTurnNum, swappedAt: now };
            turns.sort((a, b) => a.turnNumber - b.turnNumber);
            await adminDb.ref(`committees/${swapReq.committeeId}/turns`).set(turns);

            // 3. Credit admin wallet
            const amount = Number(swapReq.amount) || SWAP_FEE;
            const adminWalletSnap = await adminDb.ref("adminWallet").once("value");
            const adminWallet = adminWalletSnap.val() || { balance: 0, totalCredits: 0 };
            const newBalance = (adminWallet.balance || 0) + amount;
            const newTotalCredits = (adminWallet.totalCredits || 0) + amount;
            await adminDb.ref("adminWallet").update({
                balance: newBalance,
                totalCredits: newTotalCredits,
                lastUpdated: now,
            });

            // 4. Log admin wallet transaction
            await adminDb.ref("adminWalletTransactions").push({
                type: "credit",
                amount,
                source: "turn_swap",
                requestId,
                committeeId: swapReq.committeeId,
                fromUserId: swapReq.fromUserId,
                toUserId: swapReq.toUserId,
                paymentMethod: swapReq.paymentMethod || null,
                date: now,
                balanceAfter: newBalance,
            });

            // 5. Update swap request status
            await adminDb.ref(`turnSwapRequests/${requestId}`).update({
                status: "COMPLETED",
                adminReviewedAt: now,
                adminReviewedBy: req.user.userId,
                completedAt: now,
            });

            // 6. Notifications
            const commName = safeDecrypt(comm.name) || "committee";
            await pushNotif(swapReq.fromUserId, "Swap Successful ✅",
                `Your turn swap in ${commName} is complete. Your turns have been updated!`,
                "success", swapReq.committeeId);
            await pushNotif(swapReq.toUserId, "Your Turn Was Updated 🔄",
                `Your turn in ${commName} has been updated due to a swap.`,
                "info", swapReq.committeeId);
            if (comm.createdBy) {
                await pushNotif(comm.createdBy, "Turn Swap Completed ✅",
                    `A turn swap in ${commName} has been approved and executed by admin.`,
                    "success", swapReq.committeeId);
            }

            await logEvent("TURN_SWAP_COMPLETED", req.user.userId, {
                requestId, committeeId: swapReq.committeeId,
                fromUserId: swapReq.fromUserId, toUserId: swapReq.toUserId,
                amount, ip: req.ip
            });

            return res.json({
                success: true,
                status: "COMPLETED",
                message: "Swap approved, turns updated, and admin wallet credited.",
                newWalletBalance: newBalance,
            });

        } else {
            // Reject payment
            await adminDb.ref(`turnSwapRequests/${requestId}`).update({
                status: "PAYMENT_REJECTED",
                adminReviewedAt: now,
                adminReviewedBy: req.user.userId,
            });

            const commName = safeDecrypt(comm.name) || "committee";
            await pushNotif(swapReq.fromUserId, "Swap Payment Rejected ❌",
                `Your payment for the turn swap in ${commName} was rejected by admin. Please contact support.`,
                "error", swapReq.committeeId);

            await logEvent("TURN_SWAP_PAYMENT_REJECTED", req.user.userId, {
                requestId, committeeId: swapReq.committeeId, ip: req.ip
            });

            return res.json({ success: true, status: "PAYMENT_REJECTED" });
        }
    } catch (err) {
        console.error("[Turn/SwapAdminVerify]", err);
        return res.status(500).json({ error: "Failed to verify swap payment" });
    }
});

// ─── GET all swap requests (filtered by role/user) ──────
// GET /api/turn/swap-requests
router.get("/swap-requests", verifyToken, async (req, res) => {
    try {
        const { committeeId, status, userId: queryUserId } = req.query;
        const callerRole = req.user.role;
        const callerId = req.user.userId;

        const snap = await adminDb.ref("turnSwapRequests").once("value");
        const all = snap.val() || {};

        let requests = Object.entries(all).map(([id, r]) => ({
            id,
            ...r,
            reason: safeDecrypt(r.reason),
            // Only expose screenshot URL to admin
            paymentScreenshot: callerRole === "admin" && r.paymentScreenshot
                ? safeDecrypt(r.paymentScreenshot)
                : undefined,
        }));

        // Role-based filtering
        if (callerRole !== "admin") {
            // Initiators see requests for committees they created
            // Users see only their own requests
            if (callerRole === "initiator") {
                // Get initiator's committee IDs
                const commSnap = await adminDb.ref("committees")
                    .orderByChild("createdBy").equalTo(callerId).once("value");
                const commData = commSnap.val() || {};
                const myCommitteeIds = Object.keys(commData);
                requests = requests.filter(r =>
                    myCommitteeIds.includes(r.committeeId) ||
                    r.fromUserId === callerId || r.toUserId === callerId
                );
            } else {
                requests = requests.filter(r =>
                    r.fromUserId === callerId || r.toUserId === callerId
                );
            }
        }

        // Apply optional filters
        if (committeeId) requests = requests.filter(r => r.committeeId === committeeId);
        if (status) requests = requests.filter(r => r.status === status);
        if (queryUserId && callerRole === "admin")
            requests = requests.filter(r => r.fromUserId === queryUserId || r.toUserId === queryUserId);

        // Sort newest first
        requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return res.json({ success: true, count: requests.length, requests });
    } catch (err) {
        console.error("[Turn/SwapRequests]", err);
        return res.status(500).json({ error: "Failed to fetch swap requests" });
    }
});

module.exports = router;

