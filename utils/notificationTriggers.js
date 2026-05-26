/**
 * utils/notificationTriggers.js
 * ─────────────────────────────────────────────────────────────────────────
 * UPGRADE 5: Contract event listeners replace polling.
 *
 * attachEscrowListeners(committeeId, callbacks)
 *   → Listens for Deposited + PayoutReleased on the CommitteeEscrow contract.
 *   → Triggers expo-notifications for each event.
 *   → Returns a cleanup function: call it in useEffect return.
 *
 * Legacy polling helpers (checkPaymentReminders, checkTurnNotifications) are
 * kept unchanged below for screens that still use them.
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as Notifications from "expo-notifications";
import { getEscrowContractReadOnly } from "./walletManager";

// ── Notification helper ────────────────────────────────────────────────────
async function notify(title, body) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,   // immediate
    });
  } catch (e) {
    console.warn("[Notify]", e.message);
  }
}

// ── djb2 hash (same as WalletScreen / PaymentScreen) ──────────────────────
function djb2(str) {
  return str.split("").reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) >>> 0, 5381);
}

// ── Contract event listeners (Upgrade 5) ──────────────────────────────────

/**
 * Attach Deposited + PayoutReleased listeners for a committee pool.
 *
 * @param {string} committeeId  Firebase committee key (string)
 * @param {{ onDeposit?: fn, onPayout?: fn }} callbacks  Optional UI callbacks
 * @returns {() => void}  Cleanup function — call in useEffect return
 */
export function attachEscrowListeners(committeeId, { onDeposit, onPayout } = {}) {
  let contract;
  let active = true;

  (async () => {
    try {
      contract = getEscrowContractReadOnly();
      const numId = djb2(committeeId);

      // ── Deposited ──────────────────────────────────────────────────────
      const depositHandler = async (cid, depositor, amount) => {
        if (!active) return;
        if (Number(cid) !== numId) return;   // filter to this committee
        const eth = (Number(amount) / 1e18).toFixed(4);
        await notify(
          "New Deposit 🔒",
          `${depositor.slice(0, 6)}…${depositor.slice(-4)} deposited ${eth} ETH into the committee pool.`
        );
        onDeposit?.({ cid, depositor, amount });
      };

      // ── PayoutReleased ─────────────────────────────────────────────────
      const payoutHandler = async (cid, winner, amount) => {
        if (!active) return;
        if (Number(cid) !== numId) return;
        const eth = (Number(amount) / 1e18).toFixed(4);
        await notify(
          "Payout Released 🎉",
          `${eth} ETH released to ${winner.slice(0, 6)}…${winner.slice(-4)}.`
        );
        onPayout?.({ cid, winner, amount });
      };

      contract.on("Deposited",      depositHandler);
      contract.on("PayoutReleased", payoutHandler);
    } catch (e) {
      console.warn("[notificationTriggers] listener attach failed:", e.message);
    }
  })();

  // Return cleanup
  return () => {
    active = false;
    try { contract?.removeAllListeners("Deposited");      } catch {}
    try { contract?.removeAllListeners("PayoutReleased"); } catch {}
  };
}

// ── Legacy polling helpers (preserved) ────────────────────────────────────

export async function checkPaymentReminders(userId, committees = []) {
  try {
    if (!Array.isArray(committees)) return;
    for (const c of committees) {
      if (!c.dueDate) continue;
      const dueDate = new Date(c.dueDate);
      const now     = new Date();
      const diffMs  = dueDate - now;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > 0 && diffDays <= 3) {
        await notify(
          "Payment Reminder ⏰",
          `Your committee payment of Rs ${c.amount} is due in ${Math.ceil(diffDays)} day(s) for ${c.name || c.id}.`
        );
      }
    }
  } catch (e) {
    console.warn("[checkPaymentReminders]", e.message);
  }
}

export async function checkTurnNotifications(userId, committees = []) {
  try {
    if (!Array.isArray(committees)) return;
    for (const c of committees) {
      if (c.currentTurnUserId === userId) {
        await notify(
          "It's Your Turn! 🥳",
          `You are the current recipient for committee ${c.name || c.id}. Payout will be released soon.`
        );
      }
    }
  } catch (e) {
    console.warn("[checkTurnNotifications]", e.message);
  }
}

export async function checkAdminReminders() {
  try {
    // Use expo-notifications to show a local summary if needed.
    // This is a lightweight check — no network calls, just a placeholder
    // that can be expanded later with backend polling.
    console.log("[checkAdminReminders] Admin reminder check complete.");
  } catch (e) {
    console.warn("[checkAdminReminders]", e.message);
  }
}

/**
 * Check initiator-specific reminders.
 * Called by InitiatorDashboard on mount.
 */
export async function checkInitiatorReminders(userId) {
  try {
    console.log("[checkInitiatorReminders] Initiator reminder check complete for:", userId);
  } catch (e) {
    console.warn("[checkInitiatorReminders]", e.message);
  }
}
