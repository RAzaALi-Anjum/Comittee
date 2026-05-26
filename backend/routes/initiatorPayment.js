// ============================================================
// Initiator Payment Verification Routes
// ============================================================
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { body } = require("express-validator");
const { encryptData, decryptData, decryptFields } = require("../utils/encryption");
const { adminDb, adminFirestore } = require("../utils/firebaseAdmin");
const { verifyToken, verifyRole } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validate");
const { logEvent } = require("../utils/auditLogger");

const router = express.Router();

const SENSITIVE_FIELDS = [
    "name",
    "fullName",
    "fatherName",
    "address",
    "contactNumber",
    "cnicNumber",
    "occupation",
    "city",
    "email",
    "age",
    "gender",
    "referenceName",
    "referenceFatherName",
    "referenceAddress",
    "referenceContact",
    "referenceCnicNumber",
    "pendingReferenceName",
    "pendingReferenceAddress",
    "pendingReferenceContact",
    "pendingReferenceCnicNumber"
];

// ─── FILE UPLOAD CONFIG (Image Only) ──────────────────────
const uploadsDir = path.join(__dirname, "..", "uploads", "files");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const proofStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, `proof-${uniqueSuffix}${path.extname(file.originalname)}`);
    },
});

const proofUpload = multer({
    storage: proofStorage,
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/jpg", "image/png"];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only JPEG and PNG images are allowed."), false);
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ─── SUBMIT INITIATOR PAYMENT (User) ────────────────────
router.post(
    "/submit",
    verifyToken,
    proofUpload.single("proof"),
    async (req, res) => {
        let filePath = null;
        try {
            if (!req.file) {
                return res.status(400).json({ error: "Payment proof image is required" });
            }
            filePath = req.file.path;
            const { amount, transaction_id } = req.body;
            if (!amount) {
                return res.status(400).json({ error: "Amount paid is required" });
            }

            // Build public URL to the proof image
            const protocol = req.headers["x-forwarded-proto"] || "http";
            const host = req.headers.host || "localhost:5000";
            const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

            const userId = req.user.userId;

            const paymentRecord = {
                user_id: userId,
                amount: Number(amount),
                proof_image: fileUrl,
                transaction_id: transaction_id || null,
                method: req.body.method || "Transfer",
                status: "pending",
                created_at: new Date().toISOString(),
                type: "initiator-fee",  // for compatibility
                userId: userId          // for compatibility
            };

            const paymentRef = await adminDb.ref("payments").push(paymentRecord);
            const paymentId = paymentRef.key;

            await logEvent("PAYMENT_SUBMITTED", userId, {
                paymentId,
                amount,
                type: "initiator-fee",
                status: "pending",
                ip: req.ip,
            });

            // Send notification to Admin (using fixed ID 'ADMIN')
            try {
                const notifRef = adminDb.ref("notifications/ADMIN").push();
                await notifRef.set({
                    title: encryptData("New Initiator Payment"),
                    message: encryptData("New Initiator payment submitted for verification"),
                    type: "info",
                    createdAt: new Date().toISOString(),
                    read: false,
                    sentBy: userId,
                });
            } catch (notifErr) {
                console.error("[InitiatorPayment/Submit] Admin notification failed:", notifErr);
            }

            return res.json({
                success: true,
                paymentId,
                message: "Your payment has been submitted and is pending admin approval.",
            });
        } catch (err) {
            console.error("[InitiatorPayment/Submit] Error:", err);
            if (filePath && fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch (e) {}
            }
            return res.status(500).json({ error: "Payment submission failed: " + err.message });
        }
    }
);

// ─── GET STATUS (User/Admin) ───────────────────────────
router.get(
    "/status/:userId",
    verifyToken,
    async (req, res) => {
        try {
            const { userId } = req.params;

            // Only allow self or admin
            if (req.user.userId !== userId && req.user.role !== "admin") {
                return res.status(403).json({ error: "Access denied" });
            }

            const snapshot = await adminDb.ref("payments")
                .orderByChild("userId")
                .equalTo(userId)
                .once("value");

            const allPayments = snapshot.val();
            if (!allPayments) {
                return res.json({ success: true, payment: null });
            }

            // Find latest initiator-fee payment
            const initiatorPayments = Object.entries(allPayments)
                .map(([id, val]) => ({ id, ...val }))
                .filter(p => p.type === "initiator-fee");

            if (initiatorPayments.length === 0) {
                return res.json({ success: true, payment: null });
            }

            // Sort by created_at desc
            initiatorPayments.sort((a, b) => new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0));

            return res.json({ success: true, payment: initiatorPayments[0] });
        } catch (err) {
            console.error("[InitiatorPayment/Status] Error:", err);
            return res.status(500).json({ error: "Failed to retrieve initiator payment status" });
        }
    }
);

// ─── GET PENDING PAYMENTS (Admin Only) ─────────────────
router.get(
    "/pending",
    verifyToken,
    verifyRole("admin"),
    async (req, res) => {
        try {
            const snapshot = await adminDb.ref("payments").once("value");
            const allPayments = snapshot.val();

            if (!allPayments) {
                return res.json({ success: true, payments: [] });
            }

            const pending = [];
            for (const [id, p] of Object.entries(allPayments)) {
                if (p.type === "initiator-fee" && p.status === "pending") {
                    // Fetch and decrypt user info
                    const userSnap = await adminDb.ref(`users/${p.user_id || p.userId}`).once("value");
                    const userData = userSnap.val();
                    let userInfo = { id: p.user_id || p.userId };
                    
                    if (userData) {
                        try {
                            const decrypted = decryptFields(userData, SENSITIVE_FIELDS);
                            userInfo.name = decrypted.fullName || decrypted.name || "Unknown";
                            userInfo.email = decrypted.email || "Unknown";
                            userInfo.contactNumber = decrypted.contactNumber || "Unknown";
                        } catch (decErr) {
                            console.error(`[InitiatorPayment/Pending] Decryption error for user ${p.user_id || p.userId}:`, decErr);
                            userInfo.name = userData.fullName || userData.name || "Unknown (Encrypted)";
                            userInfo.email = userData.email || "Unknown (Encrypted)";
                        }
                    }

                    pending.push({
                        paymentId: id,
                        user_id: p.user_id || p.userId,
                        amount: p.amount,
                        proof_image: p.proof_image,
                        transaction_id: p.transaction_id,
                        status: p.status,
                        created_at: p.created_at || p.date,
                        userInfo,
                    });
                }
            }

            return res.json({ success: true, payments: pending });
        } catch (err) {
            console.error("[InitiatorPayment/Pending] Error:", err);
            return res.status(500).json({ error: "Failed to retrieve pending initiator payments" });
        }
    }
);

// ─── VERIFY INITIATOR PAYMENT (Admin Only) ──────────────
router.post(
    "/verify",
    verifyToken,
    verifyRole("admin"),
    [
        body("paymentId").notEmpty().withMessage("Payment ID is required"),
        body("action").isIn(["approve", "reject"]).withMessage("Action must be 'approve' or 'reject'"),
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { paymentId, action } = req.body;

            const paymentSnap = await adminDb.ref(`payments/${paymentId}`).once("value");
            const payment = paymentSnap.val();

            if (!payment) {
                return res.status(404).json({ error: "Payment request not found" });
            }

            const targetUserId = payment.user_id || payment.userId;

            if (action === "reject") {
                if (payment.status === "rejected") {
                    return res.status(400).json({ error: "Payment already rejected" });
                }

                // Update payment status
                await adminDb.ref(`payments/${paymentId}`).update({
                    status: "rejected",
                    verifiedAt: new Date().toISOString(),
                    verifiedBy: req.user.userId,
                });

                // Notify user
                try {
                    await adminDb.ref(`notifications/${targetUserId}`).push({
                        title: encryptData("Initiator Fee Rejected"),
                        message: encryptData("Your Initiator payment was rejected. Please contact support."),
                        type: "error",
                        createdAt: new Date().toISOString(),
                        read: false,
                        sentBy: req.user.userId,
                    });
                } catch (notifErr) {
                    console.error("[InitiatorPayment/Verify] User notification failed:", notifErr);
                }

                await logEvent("PAYMENT_REJECTED", targetUserId, {
                    paymentId,
                    amount: payment.amount,
                    type: "initiator-fee",
                    ip: req.ip,
                });

                return res.json({ success: true, message: "Payment rejected" });
            }

            // ─── APPROVE ─────────────────────────
            if (payment.status === "approved") {
                return res.json({ success: true, message: "Payment approved successfully" });
            }

            // Use transaction for wallet balance update and role assignment in RTDB
            await adminDb.ref(`users/${targetUserId}`).transaction((currentData) => {
                if (!currentData) {
                    return {
                        is_initiator: true,
                        role: "initiator",
                        initiatorStatus: "approved",
                        wallet_balance: Number(payment.amount),
                        updatedAt: new Date().toISOString(),
                    };
                }

                // Set initiator flags and role
                currentData.is_initiator = true;
                currentData.role = "initiator";
                currentData.initiatorStatus = "approved";
                currentData.wallet_balance = (Number(currentData.wallet_balance) || 0) + Number(payment.amount);
                currentData.updatedAt = new Date().toISOString();

                return currentData;
            });

            // Update Firestore user record for consistency
            try {
                await adminFirestore.collection("users").doc(targetUserId).set({
                    is_initiator: true,
                    role: "initiator",
                    initiatorStatus: "approved",
                    updatedAt: new Date(),
                }, { merge: true });
            } catch (fsErr) {
                console.error("[InitiatorPayment/Verify] Firestore update failed:", fsErr);
            }

            // Update initiatorRequests node status to approved if it exists
            try {
                // RTDB initiatorRequests
                const requestsSnap = await adminDb.ref("initiatorRequests").once("value");
                const requests = requestsSnap.val();
                if (requests) {
                    const reqId = Object.keys(requests).find(k => requests[k].userId === targetUserId);
                    if (reqId) {
                        await adminDb.ref(`initiatorRequests/${reqId}`).update({
                            status: "approved",
                            approvedAt: new Date().toISOString(),
                        });
                    }
                }
                
                // Firestore initiatorRequests
                await adminFirestore.collection("initiatorRequests").doc(targetUserId).set({
                    status: "approved",
                    approvedAt: new Date(),
                }, { merge: true });
            } catch (reqErr) {
                console.warn("[InitiatorPayment/Verify] Failed to update initiatorRequests status (non-blocking):", reqErr.message);
            }

            // Update payment status
            await adminDb.ref(`payments/${paymentId}`).update({
                status: "approved",
                verifiedAt: new Date().toISOString(),
                verifiedBy: req.user.userId,
            });

            // Append to wallet_transactions root node
            const txRef = adminDb.ref("wallet_transactions").push();
            await txRef.set({
                id: txRef.key,
                user_id: targetUserId,
                amount: Number(payment.amount),
                type: "credit",
                source: "Initiator Fee Approval",
                created_at: new Date().toISOString(),
            });

            // Notify user
            try {
                await adminDb.ref(`notifications/${targetUserId}`).push({
                    title: encryptData("Initiator Fee Approved"),
                    message: encryptData("Your Initiator payment has been approved and amount added to your wallet."),
                    type: "success",
                    createdAt: new Date().toISOString(),
                    read: false,
                    sentBy: req.user.userId,
                });
            } catch (notifErr) {
                console.error("[InitiatorPayment/Verify] User notification failed:", notifErr);
            }

            await logEvent("PAYMENT_APPROVED", targetUserId, {
                paymentId,
                amount: payment.amount,
                type: "initiator-fee",
                ip: req.ip,
            });

            return res.json({ success: true, message: "Payment approved successfully" });
        } catch (err) {
            console.error("[InitiatorPayment/Verify] Error:", err);
            return res.status(500).json({ error: "Failed to verify initiator payment: " + err.message });
        }
    }
);

module.exports = router;
