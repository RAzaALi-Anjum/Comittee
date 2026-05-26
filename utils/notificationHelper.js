import { get, push, ref, remove, set, update } from "firebase/database";
import { database } from "../firebaseConfig";
import apiClient from "../services/apiClient";

/**
 * Send a notification to a specific user
 * @param {string} userId - The target user's ID
 * @param {string} title - Notification title
 * @param {string} message - Notification body
 * @param {string} type - 'info', 'warning', 'success', 'error'
 * @param {string|null} relatedId - ID of related object (committee, loan, etc.)
 */
export const sendNotification = async (userId, title, message, type = "info", relatedId = null) => {
  if (!userId) return;
  
  // Try sending via backend first to ensure database security rules are bypassed with adminDb privileges
  try {
    const response = await apiClient.backendPost("/notification/send", {
      userIds: [userId],
      title,
      message,
      type,
      committeeId: relatedId || null
    });
    if (response && response.success) {
      return true;
    }
  } catch (backendErr) {
    console.warn("[NotificationHelper] Backend notify failed, falling back to direct RTDB:", backendErr.message);
  }

  // Fallback to direct client-side RTDB write
  try {
    const notifRef = ref(database, `notifications/${userId}`);
    const newNotifRef = push(notifRef);
    await set(newNotifRef, {
      title,
      message,
      type,
      createdAt: new Date().toISOString(),
      read: false,
      relatedId: relatedId || "",
    });
    return true;
  } catch (error) {
    console.error("Error sending notification directly:", error);
    return false;
  }
};

/**
 * Send notification to Admin
 * Uses a fixed ID 'ADMIN' for admin notifications
 */
export const sendAdminNotification = async (title, message, type = "info", relatedId = null) => {
  return sendNotification("ADMIN", title, message, type, relatedId);
};

/**
 * Mark a notification as read
 */
export const markNotificationRead = async (userId, notificationId) => {
  if (!userId || !notificationId) return;
  try {
    const notifRef = ref(database, `notifications/${userId}/${notificationId}`);
    await update(notifRef, { read: true });
  } catch (error) {
    console.error("Error marking notification read:", error);
  }
};

/**
 * Delete a notification
 */
export const deleteNotification = async (userId, notificationId) => {
  if (!userId || !notificationId) return;
  try {
    const notifRef = ref(database, `notifications/${userId}/${notificationId}`);
    await remove(notifRef);
  } catch (error) {
    console.error("Error deleting notification:", error);
  }
};

/**
 * Clear all notifications for a user
 */
export const clearAllNotifications = async (userId) => {
  if (!userId) return;
  try {
    const notifRef = ref(database, `notifications/${userId}`);
    await remove(notifRef);
  } catch (error) {
    console.error("Error clearing notifications:", error);
  }
};

/**
 * Mark all notifications as read for a user
 */
export const markAllNotificationsRead = async (userId) => {
  if (!userId) return;
  try {
    const notifRef = ref(database, `notifications/${userId}`);
    // We need to fetch current notifications first to update them, or use a loop if structure allows
    // For simplicity, we can fetch once and update all unread ones
    const snapshot = await get(notifRef);
    if (snapshot.exists()) {
      const updates = {};
      snapshot.forEach((child) => {
        if (!child.val().read) {
          updates[`${child.key}/read`] = true;
        }
      });
      if (Object.keys(updates).length > 0) {
        await update(notifRef, updates);
      }
    }
  } catch (error) {
    console.error("Error marking all notifications read:", error);
  }
};
