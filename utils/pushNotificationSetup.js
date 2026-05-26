import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ref, update } from "firebase/database";
import { database } from "../firebaseConfig";

// ── Configure notification handler (foreground display) ───────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register for Expo Push Notifications.
 * Returns the push token string if successful.
 * Stores token in AsyncStorage + Firebase user profile.
 */
export async function registerForPushNotifications() {
  let token = null;
  try {
    // Only real devices can receive push notifications
    if (!Device.isDevice) {
      console.log("[Push] Must use a physical device for push notifications.");
      return null;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("[Push] Push notification permission denied.");
      return null;
    }

    // Get Expo push token
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn(
        "[Push] No EAS projectId found. Push notifications require a development build with EAS configured."
      );
      return null;
    }
    const pushToken = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    token = pushToken.data;
    console.log("[Push] Registered push token:", token);

    // Store locally
    await AsyncStorage.setItem("expoPushToken", token);

    // Store in Firebase user profile (if user is logged in)
    try {
      const userData = await AsyncStorage.getItem("userData");
      if (userData) {
        const parsed = JSON.parse(userData);
        const userId = parsed.userId || parsed.uid;
        if (userId) {
          await update(ref(database, `users/${userId}`), {
            expoPushToken: token,
            pushTokenUpdatedAt: new Date().toISOString(),
          });
        }
      }
    } catch (fbErr) {
      console.warn("[Push] Failed to store token in Firebase:", fbErr.message);
    }

    // Android channel configuration
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#800000",
      });
    }
  } catch (err) {
    console.error("[Push] Registration failed:", err.message);
  }
  return token;
}

/**
 * Schedule a local notification (e.g., payment reminder)
 */
export async function scheduleLocalNotification(title, body, delaySeconds = 0) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: "default",
      },
      trigger: delaySeconds > 0 ? { seconds: delaySeconds } : null,
    });
  } catch (err) {
    console.error("[Push] Local notification failed:", err.message);
  }
}
