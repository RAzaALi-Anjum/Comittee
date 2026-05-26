// ============================================================
// Payment Routes — Screenshot upload, admin verification, wallet integration
// ============================================================
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { body } = require("express-validator");
const OpenAI = require("openai");
const { encryptData, decryptData, hashData } = require("../utils/encryption");
const { adminDb } = require("../utils/firebaseAdmin");
const { verifyToken, verifyRole } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validate");
const { logEvent } = require("../utils/auditLogger");

const router = express.Router();

// ─── LATE FEE CALCULATION ───────────────────────────────
// 2% per day late, capped at 10% of the base amount
function calculateLateFee(baseAmount, dueDateStr) {
    if (!dueDateStr || !baseAmount) return { lateFee: 0, daysLate: 0, totalAmount: Number(baseAmount) };
    const dueDate = new Date(dueDateStr);
    const now = new Date();
    if (isNaN(dueDate.getTime())) return { lateFee: 0, daysLate: 0, totalAmount: Number(baseAmount) };
    const diffMs = now - dueDate;
    if (diffMs <= 0) return { lateFee: 0, daysLate: 0, totalAmount: Number(baseAmount) };
    const daysLate = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const feePercent = Math.min(daysLate * 2, 10); // 2% per day, max 10%
    const lateFee = Math.round((Number(baseAmount) * feePercent) / 100);
    return { lateFee, daysLate, feePercent, totalAmount: Number(baseAmount) + lateFee };
}

// OpenAI client for screenshot analysis
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── FILE UPLOAD CONFIG ─────────────────────────────────
const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const screenshotStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, `payment-${uniqueSuffix}${path.extname(file.originalname)}`);
    },
});

const screenshotUpload = multer({
    storage: screenshotStorage,
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/jpg", "image/png"];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error("Only JPEG and PNG images are allowed."), false);
    },
    limits: { fileSize: 10 * 1024 * 1024 },
});

// ─── ANALYZE PAYMENT SCREENSHOT WITH GPT-4o ─────────────
async function analyzePaymentScreenshot(imagePath) {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");
    const ext = path.extname(imagePath).toLowerCase().replace(".", "");
    const mimeType = ext === "png" ? "image/png" : "image/jpeg";

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: "You are a payment screenshot analyzer. Extract payment details from the provided screenshot image. Return ONLY a valid JSON object.",
            },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `Analyze this payment screenshot and extract available details. Return ONLY clean JSON:
{
  "amount": "number or null",
  "sender_name": "string or null",
  "receiver_name": "string or null",
  "transaction_id": "string or null",
  "date": "YYYY-MM-DD or null",
  "payment_method": "string or null",
  "status": "string or null"
}`,
                    },
                    {
                        type: "image_url",
                        image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: "high" },
                    },
                ],
            },
        ],
        max_tokens: 500,
        temperature: 0,
    });

    const content = response.choices[0]?.message?.content || "{}";
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```\n?$/g, "").trim();
    }
    return JSON.parse(jsonStr);
}

// ─── SUBMIT PAYMENT SCREENSHOT (User) ───────────────────
// Status starts as "pending" until admin verification
router.post(
    "/submit-screenshot",
    verifyToken,
    screenshotUpload.single("screenshot"),
    async (req, res) => {
        let filePath = null;
        try {
            if (!req.file) {
                return res.status(400).json({ error: "Payment screenshot is required" });
            }

            filePath = req.file.path;
            const {
                userId,
                committeeId,
                amount,
                method,
                committeeName,
                referenceId,
            } = req.body;

            if (!userId || !committeeId || !amount) {
                return res.status(400).json({ error: "userId, committeeId, and amount are required" });
            }

            // Analyze screenshot with GPT-4o Vision
            let analysisResult = {};
            try {
                analysisResult = await analyzePaymentScreenshot(filePath);
                console.log("[Payment] Screenshot analysis:", JSON.stringify(analysisResult));
            } catch (err) {
                console.warn("[Payment] Screenshot analysis failed:", err.message);
            }

            // Read file for storage (base64 in Firebase)
            const screenshotBase64 = fs.readFileSync(filePath).toString("base64");

            // ── Calculate late fee if applicable ──
            let lateFeeData = { lateFee: 0, daysLate: 0, totalAmount: Number(amount) };
            try {
                const committeeSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
                const committeeData = committeeSnap.val();
                if (committeeData?.nextDueDate || committeeData?.dueDate) {
                    lateFeeData = calculateLateFee(amount, committeeData.nextDueDate || committeeData.dueDate);
                    if (lateFeeData.lateFee > 0) {
                        console.log(`[Payment] Late fee applied: ${lateFeeData.daysLate} days late, fee: ${lateFeeData.lateFee}, total: ${lateFeeData.totalAmount}`);
                    }
                }
            } catch (feeErr) {
                console.warn("[Payment] Late fee calculation failed (non-blocking):", feeErr.message);
            }

            // Build payment record (pending)
            const paymentRecord = {
                userId,
                committeeId,
                amount: Number(amount),
                lateFee: lateFeeData.lateFee,
                daysLate: lateFeeData.daysLate,
                totalAmount: lateFeeData.totalAmount,
                method: method || "screenshot",
                status: "pending",
                date: new Date().toISOString(),
                committeeName: committeeName ? encryptData(committeeName) : null,
                referenceId: referenceId ? encryptData(referenceId) : null,
                screenshot: encryptData(screenshotBase64),
                analysisResult: analysisResult ? encryptData(JSON.stringify(analysisResult)) : null,
                submittedAt: new Date().toISOString(),
            };

            // Save to Firebase
            const paymentRef = await adminDb.ref("payments").push(paymentRecord);
            const paymentId = paymentRef.key;

            // Update member payment status in committee to Pending Verification
            try {
                const committeeSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
                const committeeData = committeeSnap.val();

                if (committeeData && committeeData.usersParticipated) {
                    let members = committeeData.usersParticipated;
                    if (!Array.isArray(members)) {
                        members = Object.values(members);
                    }

                    const memberIndex = members.findIndex(
                        (m) => m && (m.userId === userId || m.uid === userId || m.id === userId)
                    );

                    if (memberIndex >= 0) {
                        members[memberIndex] = {
                            ...members[memberIndex],
                            paymentStatus: "Pending Verification",
                        };

                        await adminDb.ref(`committees/${committeeId}/usersParticipated`).set(members);
                    }
                }
            } catch (commitErr) {
                console.error("[Payment/SubmitScreenshot] Committee status update error:", commitErr);
            }

            await logEvent("PAYMENT_SUBMITTED", userId, {
                paymentId,
                committeeId,
                amount,
                method: method || "screenshot",
                status: "pending",
                ip: req.ip,
            });

            return res.json({
                success: true,
                paymentId,
                status: "pending",
                message: "Payment submitted. Awaiting admin verification.",
                analysisResult,
                output: {
                    user_id: userId,
                    committee_name: committeeName || "",
                    amount: Number(amount),
                    status: "pending",
                    date: new Date().toISOString().split("T")[0],
                    transaction_id: paymentId,
                },
            });
        } catch (err) {
            console.error("[Payment/SubmitScreenshot] Error:", err);
            return res.status(500).json({ error: "Payment submission failed" });
        } finally {
            if (filePath && fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch (e) { }
            }
        }
    }
);

// ─── GET PENDING PAYMENTS (Admin/Initiator) ─────────────
router.get(
    "/pending/:committeeId",
    verifyToken,
    async (req, res) => {
        try {
            const { committeeId } = req.params;

            const snapshot = await adminDb.ref("payments")
                .orderByChild("committeeId")
                .equalTo(committeeId)
                .once("value");

            const allPayments = snapshot.val();
            if (!allPayments) {
                return res.json({ success: true, payments: [] });
            }

            const pending = Object.entries(allPayments)
                .filter(([, p]) => p.status === "pending")
                .map(([id, p]) => ({
                    paymentId: id,
                    userId: p.userId,
                    amount: p.amount,
                    method: p.method,
                    status: p.status,
                    date: p.date,
                    committeeName: p.committeeName ? decryptData(p.committeeName) : null,
                    analysisResult: p.analysisResult ? JSON.parse(decryptData(p.analysisResult)) : null,
                    hasScreenshot: !!p.screenshot,
                    submittedAt: p.submittedAt,
                }));

            return res.json({ success: true, payments: pending });
        } catch (err) {
            console.error("[Payment/Pending] Error:", err);
            return res.status(500).json({ error: "Failed to retrieve pending payments" });
        }
    }
);

// ─── GET PAYMENT SCREENSHOT (Admin) ─────────────────────
router.get(
    "/screenshot/:paymentId",
    verifyToken,
    async (req, res) => {
        try {
            const { paymentId } = req.params;

            const snapshot = await adminDb.ref(`payments/${paymentId}/screenshot`).once("value");
            const encrypted = snapshot.val();

            if (!encrypted) {
                return res.status(404).json({ error: "Screenshot not found" });
            }

            const base64 = decryptData(encrypted);
            return res.json({ success: true, screenshot: base64 });
        } catch (err) {
            console.error("[Payment/Screenshot] Error:", err);
            return res.status(500).json({ error: "Failed to retrieve screenshot" });
        }
    }
);

// ─── VERIFY PAYMENT (Admin) ─────────────────────────────
// Approve or reject a pending payment
router.post(
    "/verify",
    verifyToken,
    [
        body("paymentId").notEmpty().withMessage("Payment ID is required"),
        body("action").isIn(["approve", "reject"]).withMessage("Action must be 'approve' or 'reject'"),
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { paymentId, action, rejectionReason } = req.body;

            // Get payment
            const paymentSnap = await adminDb.ref(`payments/${paymentId}`).once("value");
            const payment = paymentSnap.val();

            if (!payment) {
                return res.status(404).json({ error: "Payment not found" });
            }

            if (payment.status !== "pending") {
                return res.status(400).json({ error: `Payment is already ${payment.status}` });
            }

            if (action === "reject") {
                await adminDb.ref(`payments/${paymentId}`).update({
                    status: "rejected",
                    rejectedBy: req.user.userId,
                    rejectedAt: new Date().toISOString(),
                    rejectionReason: rejectionReason ? encryptData(rejectionReason) : null,
                });

                // Notify user
                await adminDb.ref(`notifications/${payment.userId}`).push({
                    title: encryptData("Payment Rejected"),
                    message: encryptData(`Your payment of Rs ${payment.amount} has been rejected.${rejectionReason ? " Reason: " + rejectionReason : ""}`),
                    type: "warning",
                    committeeId: payment.committeeId,
                    createdAt: new Date().toISOString(),
                    read: false,
                    sentBy: req.user.userId,
                });

                await logEvent("PAYMENT_REJECTED", req.user.userId, {
                    paymentId,
                    userId: payment.userId,
                    amount: payment.amount,
                    ip: req.ip,
                });

                return res.json({
                    success: true,
                    status: "rejected",
                    message: "Payment rejected",
                });
            }

            // ─── APPROVE ────────────────────────────────
            // 1. Create simulated blockchain ledger hash
            const payloadToHash = JSON.stringify({
                userId: payment.userId,
                amount: payment.amount,
                timestamp: new Date().toISOString(),
                committeeId: payment.committeeId,
            });
            const transactionHash = hashData(payloadToHash);

            // 2. Update payment status
            await adminDb.ref(`payments/${paymentId}`).update({
                status: "approved",
                approvedBy: req.user.userId,
                approvedAt: new Date().toISOString(),
                ledgerHash: transactionHash,
                ledgerPayload: encryptData(payloadToHash)
            });

            // 2. Credit committee wallet
            const walletSnap = await adminDb.ref(`wallets/${payment.committeeId}`).once("value");
            let wallet = walletSnap.val();

            if (!wallet) {
                // Auto-create wallet
                const committeeSnap = await adminDb.ref(`committees/${payment.committeeId}`).once("value");
                const comm = committeeSnap.val();
                wallet = {
                    committeeId: payment.committeeId,
                    committeeName: comm?.name ? encryptData(comm.name) : encryptData("Committee"),
                    balance: 0,
                    totalCredits: 0,
                    totalDebits: 0,
                    createdAt: new Date().toISOString(),
                    createdBy: req.user.userId,
                    status: "active",
                };
                await adminDb.ref(`wallets/${payment.committeeId}`).set(wallet);
            }

            const newBalance = (wallet.balance || 0) + payment.amount;
            await adminDb.ref(`wallets/${payment.committeeId}`).update({
                balance: newBalance,
                totalCredits: (wallet.totalCredits || 0) + payment.amount,
                lastUpdated: new Date().toISOString(),
            });

            // Record wallet transaction
            await adminDb.ref(`walletTransactions/${payment.committeeId}`).push({
                type: "credit",
                amount: payment.amount,
                userId: payment.userId,
                paymentId,
                description: encryptData(`Approved payment from member`),
                date: new Date().toISOString(),
                balanceAfter: newBalance,
                ledgerHash: transactionHash,
                ledgerPayload: encryptData(payloadToHash)
            });

            // 3. Update member payment status in committee
            try {
                const committeeSnap = await adminDb.ref(`committees/${payment.committeeId}`).once("value");
                const committeeData = committeeSnap.val();

                if (committeeData && committeeData.usersParticipated) {
                    // Firebase can store arrays as objects — normalize
                    let members = committeeData.usersParticipated;
                    if (!Array.isArray(members)) {
                        members = Object.values(members);
                    }

                    const memberIndex = members.findIndex(
                        (m) => m && (m.userId === payment.userId || m.uid === payment.userId || m.id === payment.userId)
                    );

                    if (memberIndex >= 0) {
                        const currentPayments = members[memberIndex].payments || [];
                        currentPayments.push({
                            paymentId,
                            amount: payment.amount,
                            date: new Date().toISOString(),
                            status: "Paid",
                            method: payment.method,
                        });

                        members[memberIndex] = {
                            ...members[memberIndex],
                            payments: currentPayments,
                            lastPaymentDate: new Date().toISOString(),
                            paymentStatus: "Paid",
                        };

                        await adminDb.ref(`committees/${payment.committeeId}/usersParticipated`).set(members);
                    }
                }
            } catch (err) {
                console.error("[Payment/Verify] Committee update error:", err);
            }

            // 4. Notify ALL committee members about the approved payment
            try {
                const committeeSnap = await adminDb.ref(`committees/${payment.committeeId}`).once("value");
                const committee = committeeSnap.val();
                if (committee && committee.usersParticipated) {
                    const members = Array.isArray(committee.usersParticipated)
                        ? committee.usersParticipated.filter(Boolean)
                        : Object.values(committee.usersParticipated).filter(Boolean);

                    // Resolve payer's real name (decrypt from profile)
                    let payerName = "A member";
                    try {
                        const payerSnap = await adminDb.ref(`users/${payment.userId}`).once("value");
                        const payerProfile = payerSnap.val() || {};
                        const rawName = payerProfile.fullName || payerProfile.name || null;
                        if (rawName) payerName = decryptData(rawName);
                        else if (payerProfile.username) payerName = payerProfile.username;
                    } catch (nameErr) {
                        console.warn("[Payment/Verify] Could not resolve payer name:", nameErr.message);
                    }

                    const committeeName = committee.name || "the committee";
                    const now = new Date().toISOString();

                    // Notify payer — personal confirmation
                    await adminDb.ref(`notifications/${payment.userId}`).push({
                        title: encryptData("✅ Payment Confirmed"),
                        message: encryptData(`Your payment of Rs ${payment.amount} for ${committeeName} has been approved.`),
                        type: "success",
                        committeeId: payment.committeeId,
                        createdAt: now,
                        read: false,
                        sentBy: "system",
                    });

                    // Notify ALL OTHER members with payer's real name
                    const notifTitle = "💳 Payment Received";
                    const notifMsg = `${payerName} has paid Rs ${payment.amount} for ${committeeName}.`;

                    const promises = members.map((m) => {
                        const uid = m.userId || m.uid || m.id;
                        if (!uid || uid === payment.userId) return null; // skip payer
                        return adminDb.ref(`notifications/${uid}`).push({
                            title: encryptData(notifTitle),
                            message: encryptData(notifMsg),
                            type: "payment",
                            committeeId: payment.committeeId,
                            payerUserId: payment.userId,
                            amount: payment.amount,
                            createdAt: now,
                            read: false,
                            sentBy: "system",
                        });
                    }).filter(Boolean);

                    await Promise.allSettled(promises);
                }
            } catch (err) {
                console.error("[Payment/Verify] Notification error:", err);
            }

            await logEvent("PAYMENT_APPROVED", req.user.userId, {
                paymentId,
                userId: payment.userId,
                amount: payment.amount,
                committeeId: payment.committeeId,
                newWalletBalance: newBalance,
                ip: req.ip,
            });

            return res.json({
                success: true,
                status: "approved",
                message: "Payment approved. Wallet credited and members notified.",
                newWalletBalance: newBalance,
                output: {
                    user_id: payment.userId,
                    committee_name: payment.committeeName ? decryptData(payment.committeeName) : "",
                    amount: payment.amount,
                    status: "approved",
                    date: new Date().toISOString().split("T")[0],
                    transaction_id: paymentId,
                },
            });
        } catch (err) {
            console.error("[Payment/Verify] Error:", err);
            return res.status(500).json({ error: "Payment verification failed" });
        }
    }
);

// ─── PROCESS PAYMENT (Direct / Card) ────────────────────
router.post(
    "/process",
    verifyToken,
    [
        body("userId").notEmpty().withMessage("User ID is required"),
        body("committeeId").notEmpty().withMessage("Committee ID is required"),
        body("amount").isNumeric().withMessage("Amount must be a number"),
        body("method").notEmpty().withMessage("Payment method is required"),
    ],
    validateRequest,
    async (req, res) => {
        try {
            const {
                userId,
                committeeId,
                amount,
                method,
                cardNumber,
                expiry,
                cvv,
                cardholderName,
                referenceId,
                committeeName,
            } = req.body;

            // Verify user is processing their own payment
            if (req.user.userId !== userId && req.user.role !== "admin") {
                await logEvent("ROLE_VIOLATION", req.user.userId, {
                    action: "payment",
                    targetUser: userId,
                    ip: req.ip,
                });
                return res.status(403).json({ error: "Access denied" });
            }

            // TC-68-02: Validate amount matches committee's required contribution
            try {
                const commSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
                const comm = commSnap.val();
                if (comm && comm.contributionAmount) {
                    const required = Number(comm.contributionAmount);
                    const submitted = Number(amount);
                    if (required > 0 && submitted !== required) {
                        await logEvent("PAYMENT_AMOUNT_MISMATCH", userId, {
                            committeeId, submitted, required, ip: req.ip,
                        });
                        return res.status(400).json({
                            error: `Amount mismatch. Required contribution is Rs ${required}, but Rs ${submitted} was submitted.`,
                            code: "AMOUNT_MISMATCH",
                            required,
                            submitted,
                        });
                    }
                }
            } catch (valErr) {
                console.warn("[Payment/Process] Amount validation failed (non-blocking):", valErr.message);
            }

            // Build secure payment record
            const paymentRecord = {
                userId,
                committeeId,
                amount: Number(amount),
                method,
                status: "Paid",
                date: new Date().toISOString(),
                committeeName: committeeName ? encryptData(committeeName) : null,
            };

            // Encrypt card data if method is Card
            if (method === "Card") {
                if (!cardNumber || !expiry || !cvv) {
                    return res.status(400).json({ error: "Card number, expiry, and CVV are required for card payments" });
                }

                const cleanCard = String(cardNumber).replace(/\s/g, "");
                if (!/^\d{13,19}$/.test(cleanCard)) {
                    return res.status(400).json({ error: "Invalid card number format" });
                }
                if (!/^\d{2}\/\d{2}$/.test(expiry)) {
                    return res.status(400).json({ error: "Invalid expiry format (MM/YY)" });
                }
                if (!/^\d{3,4}$/.test(cvv)) {
                    return res.status(400).json({ error: "Invalid CVV" });
                }

                paymentRecord.cardNumber = encryptData(cleanCard);
                paymentRecord.cardNumber_hash = hashData(cleanCard);
                paymentRecord.cardLast4 = cleanCard.slice(-4);
                paymentRecord.expiry = encryptData(expiry);
                paymentRecord.expiry_hash = hashData(expiry);
                paymentRecord.cvv = encryptData(cvv);
                paymentRecord.cvv_hash = hashData(cvv);

                if (cardholderName) {
                    paymentRecord.cardholderName = encryptData(cardholderName);
                    paymentRecord.cardholderName_hash = hashData(cardholderName);
                }
            } else {
                if (referenceId) {
                    paymentRecord.referenceId = encryptData(referenceId);
                    paymentRecord.referenceId_hash = hashData(referenceId);
                }
            }

            // Save payment record
            const paymentRef = await adminDb.ref("payments").push(paymentRecord);
            const paymentId = paymentRef.key;

            // Update committee member payment status
            try {
                const committeeSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
                const committeeData = committeeSnap.val();

                if (committeeData && committeeData.usersParticipated) {
                    // Firebase can store arrays as objects — normalize to array
                    let members = committeeData.usersParticipated;
                    if (!Array.isArray(members)) {
                        members = Object.values(members);
                    }

                    const memberIndex = members.findIndex(
                        (m) => m && (m.userId === userId || m.uid === userId || m.id === userId)
                    );

                    if (memberIndex >= 0) {
                        const currentPayments = members[memberIndex].payments || [];
                        currentPayments.push({
                            paymentId,
                            amount: Number(amount),
                            date: new Date().toISOString(),
                            status: "Paid",
                            method,
                        });

                        members[memberIndex] = {
                            ...members[memberIndex],
                            payments: currentPayments,
                            lastPaymentDate: new Date().toISOString(),
                            paymentStatus: "Paid",
                        };

                        await adminDb.ref(`committees/${committeeId}/usersParticipated`).set(members);
                    }
                }
            } catch (commitErr) {
                console.error("[Payment] Committee update error:", commitErr);
            }

            // Credit wallet
            try {
                const walletSnap = await adminDb.ref(`wallets/${committeeId}`).once("value");
                let wallet = walletSnap.val();
                if (wallet) {
                    const nb = (wallet.balance || 0) + Number(amount);
                    await adminDb.ref(`wallets/${committeeId}`).update({
                        balance: nb,
                        totalCredits: (wallet.totalCredits || 0) + Number(amount),
                        lastUpdated: new Date().toISOString(),
                    });
                    await adminDb.ref(`walletTransactions/${committeeId}`).push({
                        type: "credit",
                        amount: Number(amount),
                        userId,
                        paymentId,
                        description: encryptData("Direct payment"),
                        date: new Date().toISOString(),
                        balanceAfter: nb,
                    });
                }
            } catch (e) {
                console.error("[Payment] Wallet credit error:", e);
            }

            // Send notifications after successful direct payment (with real payer name)
            try {
                const committeeSnap2 = await adminDb.ref(`committees/${committeeId}`).once("value");
                const committee2 = committeeSnap2.val();
                if (committee2 && committee2.usersParticipated) {
                    let members2 = committee2.usersParticipated;
                    if (!Array.isArray(members2)) members2 = Object.values(members2);
                    const members2Filtered = members2.filter(Boolean);

                    // Resolve payer's real name
                    let payerName2 = "A member";
                    try {
                        const payerSnap2 = await adminDb.ref(`users/${userId}`).once("value");
                        const payerProfile2 = payerSnap2.val() || {};
                        const rawName2 = payerProfile2.fullName || payerProfile2.name || null;
                        if (rawName2) payerName2 = decryptData(rawName2);
                        else if (payerProfile2.username) payerName2 = payerProfile2.username;
                    } catch (nameErr2) {
                        console.warn("[Payment/Process] Could not resolve payer name:", nameErr2.message);
                    }

                    const committeeName2 = committee2.name || "the committee";
                    const now2 = new Date().toISOString();

                    // Notify the paying user with confirmation
                    await adminDb.ref(`notifications/${userId}`).push({
                        title: encryptData("✅ Payment Confirmed"),
                        message: encryptData(`Your payment of Rs ${amount} for ${committeeName2} has been recorded successfully.`),
                        type: "success",
                        committeeId,
                        createdAt: now2,
                        read: false,
                        sentBy: "system",
                    });

                    // Notify ALL other members with payer's real name
                    const notifPromises = members2Filtered.map((m) => {
                        const uid = m.userId || m.uid || m.id;
                        if (!uid || uid === userId) return null;
                        return adminDb.ref(`notifications/${uid}`).push({
                            title: encryptData("💳 Payment Received"),
                            message: encryptData(`${payerName2} has paid Rs ${amount} for ${committeeName2}.`),
                            type: "payment",
                            committeeId,
                            payerUserId: userId,
                            amount: Number(amount),
                            createdAt: now2,
                            read: false,
                            sentBy: "system",
                        });
                    }).filter(Boolean);
                    await Promise.allSettled(notifPromises);
                }
            } catch (notifErr) {
                console.error("[Payment/Process] Notification error:", notifErr);
            }

            await logEvent("PAYMENT_SUCCESS", userId, {
                paymentId,
                committeeId,
                amount,
                method,
                cardLast4: method === "Card" ? paymentRecord.cardLast4 : undefined,
                ip: req.ip,
            });

            return res.json({
                success: true,
                paymentId,
                message: "Payment processed securely",
                cardLast4: method === "Card" ? paymentRecord.cardLast4 : undefined,
                output: {
                    user_id: userId,
                    committee_name: committeeName || "",
                    amount: Number(amount),
                    status: "approved",
                    date: new Date().toISOString().split("T")[0],
                    transaction_id: paymentId,
                },
            });
        } catch (err) {
            console.error("[Payment/Process] Error:", err);
            await logEvent("PAYMENT_ATTEMPT", req.body?.userId, {
                error: err.message,
                committeeId: req.body?.committeeId,
                ip: req.ip,
            });
            return res.status(500).json({ error: "Payment processing failed" });
        }
    }
);

// ─── GET PAYMENTS (History) ─────────────────────────────
router.get(
    "/history",
    verifyToken,
    async (req, res) => {
        try {
            const { userId } = req.query;

            if (req.user.role !== "admin" && userId !== req.user.userId) {
                return res.status(403).json({ error: "Access denied" });
            }

            let snapshot;
            if (userId) {
                snapshot = await adminDb.ref("payments").orderByChild("userId").equalTo(userId).once("value");
            } else if (req.user.role === "admin") {
                snapshot = await adminDb.ref("payments").once("value");
            } else {
                snapshot = await adminDb.ref("payments").orderByChild("userId").equalTo(req.user.userId).once("value");
            }

            const paymentsData = snapshot.val();
            if (!paymentsData) {
                return res.json({ success: true, payments: [] });
            }

            const payments = Object.keys(paymentsData).map((key) => ({
                paymentId: key,
                ...paymentsData[key],
                committeeName: paymentsData[key].committeeName ? decryptData(paymentsData[key].committeeName) : null,
                cardNumber: undefined,
                cvv: undefined,
                screenshot: undefined, // Don't include base64 in list
            }));

            return res.json({ success: true, payments });
        } catch (err) {
            console.error("[Payment/History] Error:", err);
            return res.status(500).json({ error: "Failed to retrieve payments" });
        }
    }
);

// ─── FR-42: Apply Late Payment Fine ─────────────────────
// POST /api/payment/fine
router.post(
    "/fine",
    verifyToken,
    async (req, res) => {
        try {
            const { userId, committeeId, fineAmount, reason } = req.body;
            if (!userId || !committeeId || !fineAmount)
                return res.status(400).json({ error: "userId, committeeId, fineAmount required" });

            const commSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
            const comm = commSnap.val();
            if (!comm) return res.status(404).json({ error: "Committee not found" });
            if (comm.createdBy !== req.user.userId && req.user.role !== "admin")
                return res.status(403).json({ error: "Only initiator or admin can apply fines" });

            const now = new Date().toISOString();
            const payload = JSON.stringify({ userId, committeeId, fineAmount: Number(fineAmount), timestamp: now });
            const fineHash = hashData(payload);

            const fineRef = await adminDb.ref("fines").push({
                userId,
                committeeId,
                fineAmount: Number(fineAmount),
                reason: reason ? encryptData(reason) : encryptData("Late payment fine"),
                status: "pending",
                issuedBy: req.user.userId,
                issuedAt: now,
                ledgerHash: fineHash,
                ledgerPayload: encryptData(payload),
            });

            // FR-67/68: Notify member
            await adminDb.ref(`notifications/${userId}`).push({
                title: encryptData("⚠️ Late Payment Fine"),
                message: encryptData(`A fine of Rs ${fineAmount} has been applied for late payment in your committee.${reason ? " Reason: " + reason : ""}`),
                type: "warning",
                committeeId,
                createdAt: now,
                read: false,
                sentBy: "system",
            });

            // FR-74: Log suspicious large fine
            if (Number(fineAmount) > 5000) {
                await logEvent("SUSPICIOUS_LARGE_FINE", req.user.userId, { userId, fineAmount, committeeId, ip: req.ip });
            }

            await logEvent("FINE_APPLIED", req.user.userId, { fineId: fineRef.key, userId, committeeId, fineAmount, ip: req.ip });
            return res.json({ success: true, fineId: fineRef.key, ledgerHash: fineHash });
        } catch (err) {
            console.error("[Payment/Fine]", err);
            return res.status(500).json({ error: "Failed to apply fine" });
        }
    }
);

// ─── FR-51/55: Filter Payments by Status / Amount Range ─
// GET /api/payment/filter?committeeId=&userId=&status=&minAmount=&maxAmount=
router.get(
    "/filter",
    verifyToken,
    async (req, res) => {
        try {
            const { committeeId, userId, status, minAmount, maxAmount } = req.query;

            let snap;
            if (committeeId) {
                snap = await adminDb.ref("payments").orderByChild("committeeId").equalTo(committeeId).once("value");
            } else if (userId) {
                snap = await adminDb.ref("payments").orderByChild("userId").equalTo(userId).once("value");
            } else {
                if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required for global filter" });
                snap = await adminDb.ref("payments").once("value");
            }

            const all = snap.val() || {};
            let payments = Object.entries(all).map(([id, p]) => ({
                paymentId: id,
                userId: p.userId,
                committeeId: p.committeeId,
                amount: p.amount,
                status: p.status,
                method: p.method,
                date: p.date,
                committeeName: p.committeeName ? decryptData(p.committeeName) : null,
            }));

            if (status) payments = payments.filter(p => (p.status || "").toLowerCase() === status.toLowerCase());
            if (minAmount) payments = payments.filter(p => Number(p.amount) >= Number(minAmount));
            if (maxAmount) payments = payments.filter(p => Number(p.amount) <= Number(maxAmount));

            return res.json({ success: true, count: payments.length, payments });
        } catch (err) {
            console.error("[Payment/Filter]", err);
            return res.status(500).json({ error: "Filter failed" });
        }
    }
);

// ─── FR-67: Notify Initiator of Pending Payments ────────
// POST /api/payment/notify-pending
router.post(
    "/notify-pending",
    verifyToken,
    async (req, res) => {
        try {
            const { committeeId } = req.body;
            if (!committeeId) return res.status(400).json({ error: "committeeId required" });

            const commSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
            const comm = commSnap.val();
            if (!comm) return res.status(404).json({ error: "Committee not found" });

            const members = Array.isArray(comm.usersParticipated)
                ? comm.usersParticipated.filter(Boolean)
                : Object.values(comm.usersParticipated || {}).filter(Boolean);

            const unpaid = members.filter(m => m.paymentStatus !== "Paid");
            if (unpaid.length === 0) return res.json({ success: true, notified: 0, message: "All members have paid" });

            // Notify initiator
            if (comm.createdBy) {
                await adminDb.ref(`notifications/${comm.createdBy}`).push({
                    title: encryptData("⚠️ Pending Payments"),
                    message: encryptData(`${unpaid.length} member(s) have unpaid dues in ${decryptData(comm.name) || "your committee"}.`),
                    type: "warning",
                    committeeId,
                    createdAt: new Date().toISOString(),
                    read: false,
                    sentBy: "system",
                });
            }

            return res.json({ success: true, notified: 1, unpaidCount: unpaid.length });
        } catch (err) {
            console.error("[Payment/NotifyPending]", err);
            return res.status(500).json({ error: "Notification failed" });
        }
    }
);

// ─── FR-74: Get Suspicious Transactions (Admin) ─────────
// GET /api/payment/suspicious
router.get(
    "/suspicious",
    verifyToken,
    verifyRole("admin"),
    async (req, res) => {
        try {
            const snap = await adminDb.ref("auditLog").once("value");
            const all = snap.val() || {};
            const suspicious = Object.entries(all)
                .map(([id, e]) => ({ id, ...e }))
                .filter(e => ["SUSPICIOUS_LARGE_FINE", "ROLE_VIOLATION", "PAYMENT_ATTEMPT"].includes(e.event))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 100);
            return res.json({ success: true, count: suspicious.length, events: suspicious });
        } catch (err) {
            console.error("[Payment/Suspicious]", err);
            return res.status(500).json({ error: "Failed to fetch suspicious events" });
        }
    }
);

// ─── Multer error handler ───────────────────────────────

router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ error: "File too large. Maximum size is 10MB." });
        }
        return res.status(400).json({ error: err.message });
    }
    if (err.message && err.message.includes("Only JPEG")) {
        return res.status(400).json({ error: err.message });
    }
    next(err);
});

module.exports = router;
