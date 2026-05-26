// ============================================================
// Reminder Scheduler — Automated Deadline Reminders
// ============================================================
// Sends payment reminders to committee members at:
//   - 7 days before deadline
//   - 3 days before deadline
//   - 1 day before deadline
//   - On the deadline day
//   - After deadline (overdue)
//
// Uses node-cron to run daily at 8:00 AM local time.
// De-duplicates using Firebase sentReminders node to avoid
// sending the same reminder type twice in the same cycle.
// ============================================================

const cron = require("node-cron");
const { adminDb } = require("./firebaseAdmin");
const { encryptData } = require("./encryption");
const { logEvent } = require("./auditLogger");

// Reminder thresholds in days (before deadline)
const REMINDER_DAYS = [7, 3, 1, 0]; // 0 = due today

// ─── Core reminder engine ────────────────────────────────
async function sendDeadlineReminders() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date().toISOString();

    let totalSent = 0;
    let totalSkipped = 0;

    try {
        // Fetch all active committees
        const snap = await adminDb.ref("committees").once("value");
        const allCommittees = snap.val() || {};

        for (const [commId, comm] of Object.entries(allCommittees)) {
            // Only process active/started committees
            const status = String(comm?.status || "").toLowerCase();
            const isActive =
                comm?.active === true ||
                status === "started" ||
                status === "active" ||
                status === "approved";

            if (!isActive || !comm.usersParticipated || !comm.startDate) continue;

            // Calculate due date for current cycle
            const startDate = new Date(comm.startDate);
            if (isNaN(startDate.getTime())) continue;

            const cycleDays = Number(comm.cycleDuration) || 30;
            const diffMs = today - startDate;
            const diffDays = Math.floor(diffMs / 86400000);
            const currentCycle = Math.max(1, Math.ceil(diffDays / cycleDays));
            const dueDate = new Date(startDate);
            dueDate.setDate(startDate.getDate() + currentCycle * cycleDays);
            dueDate.setHours(0, 0, 0, 0);

            const daysUntilDue = Math.round((dueDate - today) / 86400000);

            // Normalize members array
            let members = comm.usersParticipated;
            if (!Array.isArray(members)) members = Object.values(members);
            members = members.filter(Boolean);

            // Determine if this is a reminder threshold day
            const isThreshold =
                REMINDER_DAYS.includes(daysUntilDue) || daysUntilDue < 0;

            if (!isThreshold) continue;

            // Build reminder config
            let reminderType, title, message;
            if (daysUntilDue === 7) {
                reminderType = "reminder_7d";
                title = "⏰ Payment Due in 7 Days";
                message = `Your committee payment of Rs ${comm.contributionAmount || "?"} for "${comm.name || commId}" is due in 7 days (${dueDate.toISOString().split("T")[0]}).`;
            } else if (daysUntilDue === 3) {
                reminderType = "reminder_3d";
                title = "⚠️ Payment Due in 3 Days";
                message = `Your committee payment of Rs ${comm.contributionAmount || "?"} for "${comm.name || commId}" is due in 3 days (${dueDate.toISOString().split("T")[0]}). Please arrange payment.`;
            } else if (daysUntilDue === 1) {
                reminderType = "reminder_1d";
                title = "🔔 Payment Due Tomorrow";
                message = `Your committee payment of Rs ${comm.contributionAmount || "?"} for "${comm.name || commId}" is due TOMORROW (${dueDate.toISOString().split("T")[0]}). Please pay today.`;
            } else if (daysUntilDue === 0) {
                reminderType = "reminder_due";
                title = "🔴 Payment Due Today";
                message = `Your committee payment of Rs ${comm.contributionAmount || "?"} for "${comm.name || commId}" is DUE TODAY. Please pay immediately to avoid a fine.`;
            } else if (daysUntilDue < 0) {
                reminderType = `overdue_${Math.abs(daysUntilDue)}d`;
                title = "❗ Payment Overdue";
                message = `Your committee payment for "${comm.name || commId}" is OVERDUE by ${Math.abs(daysUntilDue)} day(s). Late fines may apply.`;
            } else {
                continue;
            }

            // Generate cycle key for dedup (cycle number + reminder type)
            const cycleKey = `${commId}_${currentCycle}_${reminderType}`;

            for (const member of members) {
                const userId = member.userId || member.uid || member.id;
                if (!userId) continue;

                // Skip members who have already paid this cycle or are pending verification
                const memberPaid =
                    member.paymentStatus === "Paid" ||
                    member.paymentStatus === "paid" ||
                    member.paymentStatus === "Pending Verification";
                if (memberPaid && daysUntilDue >= 0) continue; // still send overdue if paid status is wrong

                // De-duplicate: check if this exact reminder was already sent this cycle
                const dedupKey = `${cycleKey}_${userId}`;
                const dupSnap = await adminDb
                    .ref(`sentReminders/${dedupKey.replace(/\//g, "_")}`)
                    .once("value");
                if (dupSnap.val()) {
                    totalSkipped++;
                    continue;
                }

                // Send notification
                await adminDb.ref(`notifications/${userId}`).push({
                    title: encryptData(title),
                    message: encryptData(message),
                    type: daysUntilDue < 0 ? "warning" : "soft_reminder",
                    committeeId: commId,
                    cycleNumber: currentCycle,
                    daysUntilDue,
                    createdAt: now,
                    read: false,
                    sentBy: "system",
                });

                // Mark as sent (TTL: ~45 days — auto-expires via Firebase rules if configured)
                await adminDb
                    .ref(`sentReminders/${dedupKey.replace(/\//g, "_")}`)
                    .set({ sentAt: now, type: reminderType });

                totalSent++;
            }
        }

        await logEvent("REMINDER_SCHEDULER_RUN", "system", {
            totalSent,
            totalSkipped,
            runAt: now,
        });

        console.log(`[ReminderScheduler] ✅ Run complete. Sent: ${totalSent}, Skipped: ${totalSkipped}`);
        return { totalSent, totalSkipped };
    } catch (err) {
        console.error("[ReminderScheduler] ❌ Error:", err);
        await logEvent("REMINDER_SCHEDULER_ERROR", "system", {
            error: err.message,
            runAt: now,
        });
        return { totalSent: 0, totalSkipped: 0, error: err.message };
    }
}

// ─── Start cron job ──────────────────────────────────────
function startReminderScheduler() {
    // Run every day at 8:00 AM server time
    cron.schedule("0 8 * * *", async () => {
        console.log("[ReminderScheduler] 🕗 Running daily reminder job...");
        await sendDeadlineReminders();
    });

    console.log("[ReminderScheduler] ✅ Cron scheduler started (daily at 08:00)");
}

module.exports = { startReminderScheduler, sendDeadlineReminders };
