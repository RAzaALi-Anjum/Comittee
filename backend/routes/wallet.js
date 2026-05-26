// ============================================================
// Wallet Routes — Committee wallet management
// ============================================================
const express = require("express");
const { body } = require("express-validator");
const { encryptData, decryptData, hashData } = require("../utils/encryption");
const { adminDb } = require("../utils/firebaseAdmin");
const { verifyToken, verifyRole } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validate");
const { logEvent } = require("../utils/auditLogger");

const router = express.Router();

// ─── CREATE WALLET ──────────────────────────────────────
router.post(
    "/create",
    verifyToken,
    [
        body("committeeId").notEmpty().withMessage("Committee ID is required"),
        body("committeeName").notEmpty().withMessage("Committee name is required"),
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { committeeId, committeeName } = req.body;

            // Check if wallet already exists
            const existing = await adminDb.ref(`wallets/${committeeId}`).once("value");
            if (existing.val()) {
                return res.json({
                    success: true,
                    message: "Wallet already exists",
                    walletId: committeeId,
                });
            }

            const walletData = {
                committeeId,
                committeeName: encryptData(committeeName),
                committeeName_hash: hashData(committeeName),
                balance: 0,
                totalCredits: 0,
                totalDebits: 0,
                createdAt: new Date().toISOString(),
                createdBy: req.user.userId,
                status: "active",
            };

            await adminDb.ref(`wallets/${committeeId}`).set(walletData);

            await logEvent("WALLET_CREATE", req.user.userId, {
                committeeId,
                ip: req.ip,
            });

            return res.status(201).json({
                success: true,
                walletId: committeeId,
                message: "Committee wallet created successfully",
            });
        } catch (err) {
            console.error("[Wallet/Create] Error:", err);
            return res.status(500).json({ error: "Failed to create wallet" });
        }
    }
);

// ─── GET WALLET ─────────────────────────────────────────
router.get(
    "/:committeeId",
    verifyToken,
    async (req, res) => {
        try {
            const { committeeId } = req.params;

            const snapshot = await adminDb.ref(`wallets/${committeeId}`).once("value");
            const walletData = snapshot.val();

            if (!walletData) {
                return res.status(404).json({ error: "Wallet not found" });
            }

            // Decrypt wallet name for response
            const decrypted = {
                ...walletData,
                committeeName: decryptData(walletData.committeeName),
            };
            delete decrypted.committeeName_hash;

            // Get transactions
            const txSnap = await adminDb.ref(`walletTransactions/${committeeId}`)
                .orderByChild("date")
                .limitToLast(50)
                .once("value");

            const txData = txSnap.val();
            let transactions = [];
            if (txData) {
                transactions = Object.entries(txData).map(([id, tx]) => ({
                    transactionId: id,
                    ...tx,
                    description: tx.description ? decryptData(tx.description) : null,
                    userName: tx.userName ? decryptData(tx.userName) : null,
                })).sort((a, b) => new Date(b.date) - new Date(a.date));
            }

            return res.json({
                success: true,
                wallet: decrypted,
                transactions,
            });
        } catch (err) {
            console.error("[Wallet/Get] Error:", err);
            return res.status(500).json({ error: "Failed to retrieve wallet" });
        }
    }
);

// ─── CREDIT WALLET (internal — called by payment verification) ──
router.post(
    "/credit",
    verifyToken,
    [
        body("committeeId").notEmpty().withMessage("Committee ID is required"),
        body("amount").isNumeric().withMessage("Amount must be a number"),
        body("userId").notEmpty().withMessage("User ID is required"),
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { committeeId, amount, userId, userName, paymentId, description } = req.body;
            const creditAmount = Number(amount);

            // Get current wallet
            const walletSnap = await adminDb.ref(`wallets/${committeeId}`).once("value");
            let wallet = walletSnap.val();

            // Auto-create wallet if it doesn't exist
            if (!wallet) {
                const committeeSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
                const committee = committeeSnap.val();
                wallet = {
                    committeeId,
                    committeeName: committee?.name ? encryptData(committee.name) : encryptData("Committee"),
                    balance: 0,
                    totalCredits: 0,
                    totalDebits: 0,
                    createdAt: new Date().toISOString(),
                    createdBy: req.user.userId,
                    status: "active",
                };
                await adminDb.ref(`wallets/${committeeId}`).set(wallet);
            }

            // Update balance
            const newBalance = (wallet.balance || 0) + creditAmount;
            const newTotalCredits = (wallet.totalCredits || 0) + creditAmount;

            await adminDb.ref(`wallets/${committeeId}`).update({
                balance: newBalance,
                totalCredits: newTotalCredits,
                lastUpdated: new Date().toISOString(),
            });

            // Record transaction
            const txRecord = {
                type: "credit",
                amount: creditAmount,
                userId,
                userName: userName ? encryptData(userName) : null,
                paymentId: paymentId || null,
                description: description ? encryptData(description) : encryptData(`Payment from member`),
                date: new Date().toISOString(),
                balanceAfter: newBalance,
            };

            await adminDb.ref(`walletTransactions/${committeeId}`).push(txRecord);

            await logEvent("WALLET_CREDIT", req.user.userId, {
                committeeId,
                amount: creditAmount,
                userId,
                newBalance,
                ip: req.ip,
            });

            return res.json({
                success: true,
                newBalance,
                message: `Rs ${creditAmount} credited to committee wallet`,
            });
        } catch (err) {
            console.error("[Wallet/Credit] Error:", err);
            return res.status(500).json({ error: "Failed to credit wallet" });
        }
    }
);

// ─── GET /admin-summary — Admin Wallet (Real Committees Only) ──
// GET /api/wallet/admin-summary
// Returns aggregate earnings ONLY from approved/active/real committees.
// Excludes: pending, deleted, rejected, draft committees.
router.get(
    "/admin-summary",
    verifyToken,
    verifyRole("admin"),
    async (req, res) => {
        try {
            const VALID_STATUSES = ["approved", "active", "started", "completed", "finished", "done"];

            // 1. Fetch all committees and filter to real/valid ones
            const committeesSnap = await adminDb.ref("committees").once("value");
            const allCommittees = committeesSnap.val() || {};

            const validCommitteeIds = new Set(
                Object.entries(allCommittees)
                    .filter(([, c]) => {
                        const s = String(c?.status || "").toLowerCase();
                        const isApproved = c?.isApproved === true || c?.approved === true;
                        return VALID_STATUSES.includes(s) || isApproved;
                    })
                    .map(([id]) => id)
            );

            // 2. Fetch all approved payments
            const paymentsSnap = await adminDb.ref("payments").once("value");
            const allPayments = paymentsSnap.val() || {};

            let totalEarnings = 0;
            let totalPaymentCount = 0;
            const committeeBreakdown = {};
            const recentPayments = [];

            Object.entries(allPayments).forEach(([payId, p]) => {
                // Only include payments for real committees
                if (!validCommitteeIds.has(p.committeeId)) return;
                // Only include approved/paid payments
                const status = String(p.status || "").toLowerCase();
                if (!["approved", "paid", "verified"].includes(status)) return;

                const amount = Number(p.amount) || 0;
                totalEarnings += amount;
                totalPaymentCount++;

                // Per-committee breakdown
                if (!committeeBreakdown[p.committeeId]) {
                    const comm = allCommittees[p.committeeId] || {};
                    committeeBreakdown[p.committeeId] = {
                        committeeId: p.committeeId,
                        committeeName: comm.name || "Unknown Committee",
                        status: comm.status || "unknown",
                        totalAmount: 0,
                        paymentCount: 0,
                    };
                }
                committeeBreakdown[p.committeeId].totalAmount += amount;
                committeeBreakdown[p.committeeId].paymentCount++;

                recentPayments.push({
                    paymentId: payId,
                    userId: p.userId,
                    committeeId: p.committeeId,
                    amount,
                    status: p.status,
                    date: p.date,
                    method: p.method,
                    committeeName: p.committeeName
                        ? (() => { try { return decryptData(p.committeeName); } catch { return null; } })()
                        : null,
                });
            });

            // Sort recent payments by date descending, take last 20
            recentPayments.sort((a, b) => new Date(b.date) - new Date(a.date));
            const latestPayments = recentPayments.slice(0, 20);

            // 3. Fetch wallet balances for real committees
            const walletsSnap = await adminDb.ref("wallets").once("value");
            const allWallets = walletsSnap.val() || {};
            let totalWalletBalance = 0;
            Object.entries(allWallets).forEach(([commId, w]) => {
                if (validCommitteeIds.has(commId)) {
                    totalWalletBalance += Number(w.balance) || 0;
                }
            });

            await logEvent("ADMIN_WALLET_SUMMARY", req.user.userId, { ip: req.ip });

            return res.json({
                success: true,
                summary: {
                    totalEarnings,
                    totalPaymentCount,
                    totalWalletBalance,
                    realCommitteeCount: validCommitteeIds.size,
                    totalCommitteeCount: Object.keys(allCommittees).length,
                },
                committeeBreakdown: Object.values(committeeBreakdown)
                    .sort((a, b) => b.totalAmount - a.totalAmount),
                recentPayments: latestPayments,
            });
        } catch (err) {
            console.error("[Wallet/AdminSummary] Error:", err);
            return res.status(500).json({ error: "Failed to fetch admin wallet summary" });
        }
    }
);

// ─── GET Admin Wallet (Global, for Turn Swap Fees) ──────
// GET /api/wallet/admin-wallet
router.get(
    "/admin-wallet",
    verifyToken,
    verifyRole("admin"),
    async (req, res) => {
        try {
            const walletSnap = await adminDb.ref("adminWallet").once("value");
            const wallet = walletSnap.val() || { balance: 0, totalCredits: 0, lastUpdated: null };

            const txSnap = await adminDb.ref("adminWalletTransactions")
                .orderByChild("date")
                .limitToLast(50)
                .once("value");

            const txData = txSnap.val();
            let transactions = [];
            if (txData) {
                transactions = Object.entries(txData).map(([id, tx]) => ({
                    transactionId: id,
                    ...tx,
                })).sort((a, b) => new Date(b.date) - new Date(a.date));
            }

            await logEvent("ADMIN_WALLET_VIEW", req.user.userId, { ip: req.ip });

            return res.json({
                success: true,
                wallet,
                transactions,
            });
        } catch (err) {
            console.error("[Wallet/AdminWallet] Error:", err);
            return res.status(500).json({ error: "Failed to fetch admin wallet" });
        }
    }
);

module.exports = router;
