// ============================================================
// Level & Bonus Routes — FR-18, FR-88, FR-89, FR-90, FR-91, FR-92, FR-93
// Defaults: level-up every 3 committees, bonus Rs 500/level,
//           Level-5+ earnings Rs 200 per successful committee
// ============================================================
const express = require("express");
const { encryptData, decryptData, hashData } = require("../utils/encryption");
const { adminDb } = require("../utils/firebaseAdmin");
const { verifyToken, verifyRole } = require("../middleware/auth");
const { logEvent } = require("../utils/auditLogger");
const router = express.Router();

const LEVEL_UP_EVERY = 3;       // successful committees per level
const DEFAULT_BONUS = 500;      // Rs per level-up
const LEVEL5_EARNING = 200;     // Rs per successful committee after level 5

function safeDecrypt(val) { try { return val ? decryptData(val) : val; } catch { return val; } }

async function pushNotif(userId, title, message, type) {
    try {
        await adminDb.ref(`notifications/${userId}`).push({
            title: encryptData(title), message: encryptData(message),
            type, createdAt: new Date().toISOString(), read: false, sentBy: "system",
        });
    } catch (e) { console.warn("[Level/Notif]", e.message); }
}

// ─── FR-92: Get/Set Bonus Policy (Admin) ────────────────
// GET /api/level/policy
router.get("/policy", verifyToken, async (req, res) => {
    try {
        const snap = await adminDb.ref("system/bonusPolicy").once("value");
        const policy = snap.val() || {
            levelUpEvery: LEVEL_UP_EVERY,
            bonusPerLevel: DEFAULT_BONUS,
            level5Earning: LEVEL5_EARNING,
        };
        return res.json({ success: true, policy });
    } catch (err) {
        console.error("[Level/Policy]", err);
        return res.status(500).json({ error: "Failed to fetch policy" });
    }
});

// POST /api/level/policy
router.post("/policy", verifyToken, verifyRole("admin"), async (req, res) => {
    try {
        const { levelUpEvery, bonusPerLevel, level5Earning } = req.body;
        const policy = {
            levelUpEvery: Number(levelUpEvery) || LEVEL_UP_EVERY,
            bonusPerLevel: Number(bonusPerLevel) || DEFAULT_BONUS,
            level5Earning: Number(level5Earning) || LEVEL5_EARNING,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.userId,
        };
        await adminDb.ref("system/bonusPolicy").set(policy);
        await logEvent("BONUS_POLICY_UPDATED", req.user.userId, { policy, ip: req.ip });
        return res.json({ success: true, policy });
    } catch (err) {
        console.error("[Level/Policy]", err);
        return res.status(500).json({ error: "Failed to update policy" });
    }
});

// ─── FR-18: Check & Apply Level Increase ────────────────
// POST /api/level/check-levelup
router.post("/check-levelup", verifyToken, async (req, res) => {
    try {
        const { initiatorId } = req.body;
        const targetId = initiatorId || req.user.userId;

        // Load policy
        const policySnap = await adminDb.ref("system/bonusPolicy").once("value");
        const policy = policySnap.val() || { levelUpEvery: LEVEL_UP_EVERY, bonusPerLevel: DEFAULT_BONUS, level5Earning: LEVEL5_EARNING };

        // Get user
        const userSnap = await adminDb.ref(`users/${targetId}`).once("value");
        const user = userSnap.val();
        if (!user) return res.status(404).json({ error: "User not found" });

        const currentLevel = user.initiatorLevel || 1;

        // Count completed committees
        const commSnap = await adminDb.ref("committees").once("value");
        const allComm = commSnap.val() || {};
        const completedCount = Object.values(allComm).filter(c => {
            const inComm = Array.isArray(c.usersParticipated)
                ? c.usersParticipated.some(m => (m.userId || m.uid || m.id) === targetId && m.userId === c.createdBy)
                : false;
            const isCreator = c.createdBy === targetId;
            return isCreator && (c.status === "completed" || c.status === "ended");
        }).length;

        const expectedLevel = Math.max(1, Math.floor(completedCount / policy.levelUpEvery) + 1);

        if (expectedLevel <= currentLevel) {
            return res.json({
                success: true,
                leveled_up: false,
                currentLevel,
                completedCommittees: completedCount,
                nextLevelAt: (currentLevel * policy.levelUpEvery) - completedCount + " more committees",
            });
        }

        // Level up!
        const now = new Date().toISOString();
        await adminDb.ref(`users/${targetId}`).update({
            initiatorLevel: expectedLevel,
            lastLevelUpAt: now,
        });

        // FR-88/91: Credit bonus for each new level
        const levelsGained = expectedLevel - currentLevel;
        const bonusAmount = levelsGained * policy.bonusPerLevel;
        const earningsSnap = await adminDb.ref(`earnings/${targetId}`).once("value");
        const earnings = earningsSnap.val() || { balance: 0, total: 0 };
        const newBalance = (earnings.balance || 0) + bonusAmount;

        const transPayload = JSON.stringify({ targetId, bonusAmount, newLevel: expectedLevel, timestamp: now });
        const transHash = hashData(transPayload);

        await adminDb.ref(`earnings/${targetId}`).update({
            balance: newBalance,
            total: (earnings.total || 0) + bonusAmount,
            lastUpdated: now,
        });
        await adminDb.ref(`earningsTransactions/${targetId}`).push({
            type: "bonus",
            amount: bonusAmount,
            reason: encryptData(`Level up bonus: Level ${currentLevel} → ${expectedLevel}`),
            createdAt: now,
            ledgerHash: transHash,
            ledgerPayload: encryptData(transPayload),
        });

        // FR-88/69: Notify initiator
        await pushNotif(targetId,
            `🎉 Level Up! Now Level ${expectedLevel}`,
            `Congratulations! You've reached Level ${expectedLevel}. Bonus of Rs ${bonusAmount} credited to your earnings.`,
            "success");

        await logEvent("INITIATOR_LEVEL_UP", req.user.userId, { targetId, from: currentLevel, to: expectedLevel, bonus: bonusAmount, ip: req.ip });

        return res.json({
            success: true,
            leveled_up: true,
            previousLevel: currentLevel,
            newLevel: expectedLevel,
            bonusEarned: bonusAmount,
            newEarningsBalance: newBalance,
        });
    } catch (err) {
        console.error("[Level/CheckLevelup]", err);
        return res.status(500).json({ error: "Level check failed" });
    }
});

// ─── FR-89/90: Credit Level-5+ Committee Earnings ───────
// POST /api/level/credit-earnings
router.post("/credit-earnings", verifyToken, async (req, res) => {
    try {
        const { initiatorId, committeeId } = req.body;
        const targetId = initiatorId || req.user.userId;
        if (req.user.userId !== targetId && req.user.role !== "admin")
            return res.status(403).json({ error: "Access denied" });

        const userSnap = await adminDb.ref(`users/${targetId}`).once("value");
        const user = userSnap.val();
        if (!user) return res.status(404).json({ error: "User not found" });

        const level = user.initiatorLevel || 1;
        if (level < 5) return res.status(400).json({ error: "Earnings only available from Level 5+ (FR-89)" });

        const policySnap = await adminDb.ref("system/bonusPolicy").once("value");
        const policy = policySnap.val() || { level5Earning: LEVEL5_EARNING };
        const earning = policy.level5Earning || LEVEL5_EARNING;

        const now = new Date().toISOString();
        const payload = JSON.stringify({ targetId, committeeId, earning, timestamp: now });
        const earnHash = hashData(payload);

        const earningsSnap = await adminDb.ref(`earnings/${targetId}`).once("value");
        const earnings = earningsSnap.val() || { balance: 0, total: 0 };
        const newBalance = (earnings.balance || 0) + earning;

        await adminDb.ref(`earnings/${targetId}`).update({
            balance: newBalance, total: (earnings.total || 0) + earning, lastUpdated: now,
        });
        await adminDb.ref(`earningsTransactions/${targetId}`).push({
            type: "committee_earning",
            amount: earning,
            committeeId: committeeId || null,
            reason: encryptData(`Level ${level}+ committee success earning`),
            createdAt: now,
            ledgerHash: earnHash,
            ledgerPayload: encryptData(payload),
        });

        // FR-69/73: Notify
        await pushNotif(targetId, "💰 Earnings Credited",
            `Rs ${earning} has been credited for your successful committee at Level ${level}.`, "success");

        await logEvent("EARNINGS_CREDITED", req.user.userId, { targetId, committeeId, earning, earnHash, ip: req.ip });
        return res.json({ success: true, earned: earning, newBalance });
    } catch (err) {
        console.error("[Level/CreditEarnings]", err);
        return res.status(500).json({ error: "Earnings credit failed" });
    }
});

// ─── FR-89/90: Get Earnings Balance ─────────────────────
// GET /api/level/earnings/:initiatorId
router.get("/earnings/:initiatorId", verifyToken, async (req, res) => {
    try {
        const { initiatorId } = req.params;
        if (req.user.userId !== initiatorId && req.user.role !== "admin")
            return res.status(403).json({ error: "Access denied" });
        const earningsSnap = await adminDb.ref(`earnings/${initiatorId}`).once("value");
        const earnings = earningsSnap.val() || { balance: 0, total: 0 };
        const txSnap = await adminDb.ref(`earningsTransactions/${initiatorId}`).once("value");
        const txRaw = txSnap.val() || {};
        const transactions = Object.entries(txRaw).map(([id, t]) => ({
            id, ...t, reason: safeDecrypt(t.reason),
        }));
        return res.json({ success: true, earnings, transactions });
    } catch (err) {
        console.error("[Level/Earnings]", err);
        return res.status(500).json({ error: "Failed to fetch earnings" });
    }
});

// ─── FR-93: Admin Freeze/Unfreeze Rewards ───────────────
// POST /api/level/freeze
router.post("/freeze", verifyToken, verifyRole("admin"), async (req, res) => {
    try {
        const { initiatorId, action, reason } = req.body;
        if (!initiatorId || !["freeze", "unfreeze"].includes(action))
            return res.status(400).json({ error: "initiatorId and action (freeze/unfreeze) required" });

        await adminDb.ref(`earnings/${initiatorId}`).update({
            frozen: action === "freeze",
            frozenAt: action === "freeze" ? new Date().toISOString() : null,
            frozenReason: reason ? encryptData(reason) : null,
            frozenBy: req.user.userId,
        });

        const notifMsg = action === "freeze"
            ? `Your earnings have been frozen by admin.${reason ? " Reason: " + reason : ""}`
            : "Your earnings have been unfrozen by admin.";
        await pushNotif(initiatorId, action === "freeze" ? "⚠️ Earnings Frozen" : "✅ Earnings Unfrozen", notifMsg, "warning");

        await logEvent(`EARNINGS_${action.toUpperCase()}D`, req.user.userId, { initiatorId, reason, ip: req.ip });
        return res.json({ success: true, frozen: action === "freeze" });
    } catch (err) {
        console.error("[Level/Freeze]", err);
        return res.status(500).json({ error: "Freeze action failed" });
    }
});

module.exports = router;
