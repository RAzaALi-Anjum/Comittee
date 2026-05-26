// ============================================================
// Notification Routes — Server-side notifications & reminders
// ============================================================
const express = require("express");
const { body } = require("express-validator");
const { encryptData, decryptData } = require("../utils/encryption");
const { adminDb } = require("../utils/firebaseAdmin");
const { verifyToken, verifyRole } = require("../middleware/auth");
const { validateRequest } = require("../middleware/validate");
const { logEvent } = require("../utils/auditLogger");
const { sendDeadlineReminders } = require("../utils/reminderScheduler");


const router = express.Router();

// ─── SEND NOTIFICATION ──────────────────────────────────
// Send to one or more specific users
router.post(
    "/send",
    verifyToken,
    [
        body("userIds").isArray({ min: 1 }).withMessage("At least one user ID is required"),
        body("title").notEmpty().withMessage("Title is required"),
        body("message").notEmpty().withMessage("Message is required"),
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { userIds, title, message, type, committeeId } = req.body;
            const notifType = type || "info";
            const now = new Date().toISOString();

            const notificationData = {
                title: encryptData(title),
                message: encryptData(message),
                type: notifType,
                committeeId: committeeId || null,
                createdAt: now,
                read: false,
                sentBy: req.user.userId,
            };

            // Send to each user
            const promises = userIds.map((uid) =>
                adminDb.ref(`notifications/${uid}`).push(notificationData)
            );
            await Promise.all(promises);

            await logEvent("NOTIFICATION_SENT", req.user.userId, {
                recipientCount: userIds.length,
                type: notifType,
                committeeId,
                ip: req.ip,
            });

            return res.json({
                success: true,
                message: `Notification sent to ${userIds.length} user(s)`,
                output: {
                    user_ids: userIds,
                    message: message,
                    type: notifType === "info" ? "payment" : notifType,
                    date: now.split("T")[0],
                },
            });
        } catch (err) {
            console.error("[Notification/Send] Error:", err);
            return res.status(500).json({ error: "Failed to send notification" });
        }
    }
);

// ─── NOTIFY ALL COMMITTEE MEMBERS ───────────────────────
router.post(
    "/committee",
    verifyToken,
    [
        body("committeeId").notEmpty().withMessage("Committee ID is required"),
        body("title").notEmpty().withMessage("Title is required"),
        body("message").notEmpty().withMessage("Message is required"),
    ],
    validateRequest,
    async (req, res) => {
        try {
            const { committeeId, title, message, type, excludeUserId } = req.body;
            const notifType = type || "payment";
            const now = new Date().toISOString();

            // Get committee members
            const committeeSnap = await adminDb.ref(`committees/${committeeId}`).once("value");
            const committee = committeeSnap.val();

            if (!committee || !committee.usersParticipated) {
                return res.status(404).json({ error: "Committee not found or has no members" });
            }

            const members = Array.isArray(committee.usersParticipated)
                ? committee.usersParticipated.filter(Boolean)
                : Object.values(committee.usersParticipated).filter(Boolean);

            const userIds = members
                .map((m) => m.userId || m.uid || m.id)
                .filter((uid) => uid && uid !== excludeUserId);

            if (userIds.length === 0) {
                return res.json({ success: true, message: "No members to notify" });
            }

            const notificationData = {
                title: encryptData(title),
                message: encryptData(message),
                type: notifType,
                committeeId,
                createdAt: now,
                read: false,
                sentBy: req.user.userId,
            };

            const promises = userIds.map((uid) =>
                adminDb.ref(`notifications/${uid}`).push(notificationData)
            );
            await Promise.all(promises);

            await logEvent("NOTIFICATION_COMMITTEE", req.user.userId, {
                committeeId,
                recipientCount: userIds.length,
                type: notifType,
                ip: req.ip,
            });

            return res.json({
                success: true,
                message: `Notification sent to ${userIds.length} committee member(s)`,
                output: {
                    user_ids: userIds,
                    message: message,
                    type: notifType,
                    date: now.split("T")[0],
                },
            });
        } catch (err) {
            console.error("[Notification/Committee] Error:", err);
            return res.status(500).json({ error: "Failed to notify committee" });
        }
    }
);

// ─── TRIGGER SOFT REMINDERS ─────────────────────────────
// Check for pending payments near due dates and notify
router.post(
    "/remind",
    verifyToken,
    async (req, res) => {
        try {
            const { committeeId } = req.body;
            const today = new Date();
            let committeesToCheck = {};

            if (committeeId) {
                const snap = await adminDb.ref(`committees/${committeeId}`).once("value");
                if (snap.val()) committeesToCheck[committeeId] = snap.val();
            } else {
                const snap = await adminDb.ref("committees").once("value");
                committeesToCheck = snap.val() || {};
            }

            let remindersSent = 0;

            for (const [commId, comm] of Object.entries(committeesToCheck)) {
                const isActive = comm?.active === true || comm?.status === "Started" || comm?.status === "Active";
                if (!isActive || !comm.usersParticipated) continue;

                const members = Array.isArray(comm.usersParticipated)
                    ? comm.usersParticipated.filter(Boolean)
                    : Object.values(comm.usersParticipated).filter(Boolean);

                if (!comm.startDate) continue;
                const startDate = new Date(comm.startDate);
                if (isNaN(startDate.getTime())) continue;

                const cycleDuration = comm.cycleDuration || 30;
                const diffDays = Math.ceil(Math.abs(today - startDate) / (1000 * 60 * 60 * 24));
                const currentCycle = Math.max(1, Math.ceil(diffDays / cycleDuration));
                const dueDate = new Date(startDate);
                dueDate.setDate(startDate.getDate() + currentCycle * cycleDuration);
                const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

                for (const member of members) {
                    const userId = member.userId || member.uid || member.id;
                    if (!userId) continue;
                    if (member.paymentStatus === "Paid") continue;

                    // Send soft reminder if within 5 days of due date
                    if (daysUntilDue >= 0 && daysUntilDue <= 5) {
                        const title = daysUntilDue === 0 ? "Payment Due Today" : "Payment Reminder";
                        const msg = daysUntilDue === 0
                            ? `Your payment for ${comm.name || "committee"} is due today!`
                            : `Your payment for ${comm.name || "committee"} is due in ${daysUntilDue} day(s). Please pay on time.`;

                        await adminDb.ref(`notifications/${userId}`).push({
                            title: encryptData(title),
                            message: encryptData(msg),
                            type: "soft_reminder",
                            committeeId: commId,
                            createdAt: today.toISOString(),
                            read: false,
                            sentBy: "system",
                        });
                        remindersSent++;
                    }
                }
            }

            return res.json({
                success: true,
                remindersSent,
                message: `${remindersSent} soft reminder(s) sent`,
            });
        } catch (err) {
            console.error("[Notification/Remind] Error:", err);
            return res.status(500).json({ error: "Failed to send reminders" });
        }
    }
);

// ─── FR-61/62/63: Pre-due (4-day), Due-date, Post-due Reminders ──
// Enhanced version — triggers per FR spec (4 days before)
router.post(
    "/remind-due",
    verifyToken,
    async (req, res) => {
        try {
            const { committeeId } = req.body;
            const today = new Date();
            let committeesToCheck = {};

            if (committeeId) {
                const snap = await adminDb.ref(`committees/${committeeId}`).once("value");
                if (snap.val()) committeesToCheck[committeeId] = snap.val();
            } else {
                const snap = await adminDb.ref("committees").once("value");
                committeesToCheck = snap.val() || {};
            }

            let remindersSent = 0;

            for (const [commId, comm] of Object.entries(committeesToCheck)) {
                const isActive = comm?.active === true || ["Started", "Active"].includes(comm?.status || "");
                if (!isActive || !comm.usersParticipated || !comm.startDate) continue;

                const startDate = new Date(comm.startDate);
                if (isNaN(startDate.getTime())) continue;
                const cycleDays = comm.cycleDuration || 30;
                const diffDays = Math.ceil(Math.abs(today - startDate) / 86400000);
                const currentCycle = Math.max(1, Math.ceil(diffDays / cycleDays));
                const dueDate = new Date(startDate);
                dueDate.setDate(startDate.getDate() + currentCycle * cycleDays);
                const daysUntilDue = Math.ceil((dueDate - today) / 86400000);

                const members = Array.isArray(comm.usersParticipated)
                    ? comm.usersParticipated.filter(Boolean)
                    : Object.values(comm.usersParticipated).filter(Boolean);

                for (const member of members) {
                    const userId = member.userId || member.uid || member.id;
                    if (!userId || member.paymentStatus === "Paid") continue;

                    let title, msg, type;
                    if (daysUntilDue === 4) {
                        // FR-61: Pre-due (4 days before)
                        title = "⏰ Payment Due in 4 Days";
                        msg = `Your payment for ${comm.name || "committee"} is due in 4 days (${dueDate.toISOString().split("T")[0]}).`;
                        type = "soft_reminder";
                    } else if (daysUntilDue === 0) {
                        // FR-62: Due date reminder
                        title = "🔴 Payment Due Today";
                        msg = `Your payment for ${comm.name || "committee"} is due TODAY. Please pay immediately.`;
                        type = "soft_reminder";
                    } else if (daysUntilDue < 0) {
                        // FR-63: Post-due overdue
                        title = "❗ Payment Overdue";
                        msg = `Your payment for ${comm.name || "committee"} is OVERDUE by ${Math.abs(daysUntilDue)} day(s). Late fines may apply.`;
                        type = "warning";
                    } else if (daysUntilDue <= 5) {
                        title = "Payment Reminder";
                        msg = `Your payment for ${comm.name || "committee"} is due in ${daysUntilDue} day(s).`;
                        type = "soft_reminder";
                    } else continue;

                    await adminDb.ref(`notifications/${userId}`).push({
                        title: encryptData(title), message: encryptData(msg),
                        type, committeeId: commId, createdAt: today.toISOString(), read: false, sentBy: "system",
                    });
                    remindersSent++;
                }
            }

            return res.json({ success: true, remindersSent });
        } catch (err) {
            console.error("[Notification/RemindDue]", err);
            return res.status(500).json({ error: "Failed to send reminders" });
        }
    }
);

// ─── FR-64: Notify on Committee Creation/Deletion ────────
// POST /api/notification/committee-event
router.post(
    "/committee-event",
    verifyToken,
    async (req, res) => {
        try {
            const { event, committeeId, committeeName, targetUserIds } = req.body;
            if (!event || !committeeId) return res.status(400).json({ error: "event and committeeId required" });
            const now = new Date().toISOString();
            const isCreate = event === "created";
            const title = isCreate ? "🆕 New Committee Available" : "❌ Committee Removed";
            const msg = isCreate
                ? `A new committee "${committeeName || committeeId}" is now open for participation.`
                : `The committee "${committeeName || committeeId}" has been deleted.`;

            const uids = Array.isArray(targetUserIds) && targetUserIds.length > 0
                ? targetUserIds
                : await (async () => {
                    const snap = await adminDb.ref("users").once("value");
                    return Object.keys(snap.val() || {});
                })();

            await Promise.all(uids.map(uid =>
                adminDb.ref(`notifications/${uid}`).push({
                    title: encryptData(title), message: encryptData(msg),
                    type: "info", committeeId, createdAt: now, read: false, sentBy: req.user.userId,
                })
            ));
            return res.json({ success: true, notified: uids.length });
        } catch (err) {
            console.error("[Notification/CommitteeEvent]", err);
            return res.status(500).json({ error: "Failed to send committee event notification" });
        }
    }
);

// ─── FR-71: Notify Admin of New Complaint ───────────────
// POST /api/notification/complaint
router.post(
    "/complaint",
    verifyToken,
    async (req, res) => {
        try {
            const { complaintId, complainantId, targetId, summary } = req.body;
            const now = new Date().toISOString();
            const adminSnap = await adminDb.ref("users").orderByChild("role").equalTo("admin").once("value");
            const admins = adminSnap.val() || {};
            await Promise.all(Object.keys(admins).map(adminId =>
                adminDb.ref(`notifications/${adminId}`).push({
                    title: encryptData("🚨 New Complaint Submitted"),
                    message: encryptData(`A new complaint has been filed${summary ? ": " + summary : ""}. Complainant: ${complainantId || "unknown"}.`),
                    type: "warning",
                    complaintId: complaintId || null,
                    createdAt: now, read: false, sentBy: "system",
                })
            ));
            return res.json({ success: true, notified: Object.keys(admins).length });
        } catch (err) {
            console.error("[Notification/Complaint]", err);
            return res.status(500).json({ error: "Failed to notify admins" });
        }
    }
);

// ─── FR-73: Admin Bonus Approval Pending ─────────────────
// POST /api/notification/bonus-pending
router.post(
    "/bonus-pending",
    verifyToken,
    async (req, res) => {
        try {
            const { initiatorId, amount, reason } = req.body;
            const now = new Date().toISOString();
            const adminSnap = await adminDb.ref("users").orderByChild("role").equalTo("admin").once("value");
            const admins = adminSnap.val() || {};
            await Promise.all(Object.keys(admins).map(adminId =>
                adminDb.ref(`notifications/${adminId}`).push({
                    title: encryptData("💰 Bonus Approval Required"),
                    message: encryptData(`A bonus of Rs ${amount} is pending approval for initiator ${initiatorId}.${reason ? " Reason: " + reason : ""}`),
                    type: "info",
                    createdAt: now, read: false, sentBy: "system",
                })
            ));
            return res.json({ success: true, notified: Object.keys(admins).length });
        } catch (err) {
            console.error("[Notification/BonusPending]", err);
            return res.status(500).json({ error: "Failed to notify" });
        }
    }
);

// ─── Get notifications for a user ────────────────────────
// GET /api/notification/user/:userId
router.get(
    "/user/:userId",
    verifyToken,
    async (req, res) => {
        try {
            const { userId } = req.params;
            if (req.user.userId !== userId && req.user.role !== "admin")
                return res.status(403).json({ error: "Access denied" });
            const snap = await adminDb.ref(`notifications/${userId}`).once("value");
            const all = snap.val() || {};
            const notifications = Object.entries(all)
                .map(([id, n]) => ({
                    id, ...n,
                    title: decryptData(n.title),
                    message: decryptData(n.message),
                }))
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return res.json({ success: true, notifications });
        } catch (err) {
            console.error("[Notification/UserGet]", err);
            return res.status(500).json({ error: "Failed to fetch notifications" });
        }
    }
);

// ─── Mark notification as read ───────────────────────────
// POST /api/notification/mark-read
router.post(
    "/mark-read",
    verifyToken,
    async (req, res) => {
        try {
            const { userId, notificationId } = req.body;
            if (!userId || !notificationId) return res.status(400).json({ error: "userId and notificationId required" });
            if (req.user.userId !== userId && req.user.role !== "admin")
                return res.status(403).json({ error: "Access denied" });
            await adminDb.ref(`notifications/${userId}/${notificationId}`).update({ read: true, readAt: new Date().toISOString() });
            return res.json({ success: true });
        } catch (err) {
            console.error("[Notification/MarkRead]", err);
            return res.status(500).json({ error: "Failed to mark as read" });
        }
    }
);

// ─── POST /run-reminders — Manual Admin Trigger ──────────
// Run the full 7/3/1-day reminder engine on demand (admin only)
// POST /api/notification/run-reminders
router.post(
    "/run-reminders",
    verifyToken,
    verifyRole("admin"),
    async (req, res) => {
        try {
            console.log("[Notification/RunReminders] Manual trigger by:", req.user.userId);
            const result = await sendDeadlineReminders();
            return res.json({
                success: true,
                message: "Deadline reminders processed",
                ...result,
            });
        } catch (err) {
            console.error("[Notification/RunReminders]", err);
            return res.status(500).json({ error: "Failed to run reminders" });
        }
    }
);

module.exports = router;
