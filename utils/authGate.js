/**
 * utils/authGate.js
 * ──────────────────────────────────────────────────────────────────────────
 * Cross-platform biometric authentication gate (iOS + Android).
 *
 * Flow:
 *   1. Try expo-local-authentication (Face ID / fingerprint / iris).
 *   2. If unavailable or user cancels → retry with device credentials
 *      (Android PIN/pattern/password, iOS passcode) by setting
 *      disableDeviceFallback: false.
 *   3. If the device has NO authentication configured at all → allow through
 *      (no security to enforce; warn in console).
 *
 * NOTE: Requires a native dev build (not Expo Go).
 *       Install: expo-local-authentication, expo-secure-store
 * ──────────────────────────────────────────────────────────────────────────
 */

import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const PIN_STORE_KEY = "committee_auth_pin";

// ── Helpers ────────────────────────────────────────────────────────────────

async function isBiometricAvailable() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled  = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

/**
 * Attempt biometric auth. On failure or cancellation, let caller decide
 * whether to try device-credential fallback.
 */
async function promptBiometric() {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage:         "Authenticate to confirm payment",
      cancelLabel:           "Cancel",
      // disableDeviceFallback: true keeps this to biometrics only;
      // we handle device-credential fallback ourselves below.
      disableDeviceFallback: true,
    });
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Attempt device-credential auth (Android PIN/pattern, iOS passcode).
 * This is the reliable cross-platform fallback.
 */
async function promptDeviceCredential() {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage:         "Enter your device PIN to confirm payment",
      cancelLabel:           "Cancel",
      disableDeviceFallback: false,  // allows PIN/pattern/passcode
    });
    return result.success;
  } catch {
    return false;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Gate a sensitive action behind biometric or device-credential authentication.
 * @returns {Promise<boolean>} true if authenticated, false if cancelled/failed.
 */
export async function requireAuth() {
  const bioAvailable = await isBiometricAvailable();

  if (bioAvailable) {
    const bioOk = await promptBiometric();
    if (bioOk) return true;
    // Biometric failed or user cancelled — fall through to device credential
  }

  // Device-credential fallback: works on both Android and iOS natively,
  // no custom Modal or Alert.prompt needed.
  return promptDeviceCredential();
}

/**
 * Store a backup 4-digit PIN in SecureStore (optional; used by settings screen).
 */
export async function setPin(pin) {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error("PIN must be exactly 4 numeric digits.");
  }
  await SecureStore.setItemAsync(PIN_STORE_KEY, pin);
}

export { isBiometricAvailable };
