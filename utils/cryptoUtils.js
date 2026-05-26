import CryptoJS from "crypto-js";

// Uses the same hex keys from backend for frontend validation
const AES_SECRET_KEY = CryptoJS.enc.Hex.parse("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2");
const AES_IV = CryptoJS.enc.Hex.parse("f1e2d3c4b5a69788a9b0c1d2e3f4a5b6");

/**
 * Decrypt AES-256-CBC ciphertext
 * Expected ciphertext is base64
 */
export const decryptAES256 = (cipherText) => {
  if (!cipherText) return cipherText;
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, AES_SECRET_KEY, {
      iv: AES_IV,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return decrypted || cipherText; // Return original if decryption fails (e.g., plain text)
  } catch (err) {
    return cipherText;
  }
};

/**
 * Generate SHA-256 Hash
 */
export const createSHA256Hash = (data) => {
  if (!data) return data;
  return CryptoJS.SHA256(String(data)).toString(CryptoJS.enc.Hex);
};

/**
 * Validates a simulated blockchain ledger record
 * Returns boolean
 */
export const verifyLedgerHash = (encryptedPayload, providedHash) => {
  if (!encryptedPayload || !providedHash) return false;
  
  const decryptedPayload = decryptAES256(encryptedPayload);
  const calculatedHash = createSHA256Hash(decryptedPayload);
  
  return calculatedHash === providedHash;
};
