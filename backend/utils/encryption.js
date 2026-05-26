// ============================================================
// AES-256 Encryption, Hashing, and Bcrypt Utilities
// ============================================================
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const ALGORITHM = "aes-256-cbc";
const AES_KEY = Buffer.from(process.env.AES_SECRET_KEY, "hex"); // 32 bytes
const AES_IV = Buffer.from(process.env.AES_IV, "hex"); // 16 bytes
const BCRYPT_SALT_ROUNDS = 10;

/**
 * Encrypt plaintext string using AES-256-CBC.
 * @param {string} plainText
 * @returns {string} base64-encoded ciphertext
 */
function encryptData(plainText) {
  if (!plainText) return plainText;
  const cipher = crypto.createCipheriv(ALGORITHM, AES_KEY, AES_IV);
  let encrypted = cipher.update(String(plainText), "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

/**
 * Decrypt AES-256-CBC ciphertext.
 * @param {string} cipherText — base64-encoded
 * @returns {string} original plaintext
 */
function decryptData(cipherText) {
  if (!cipherText) return cipherText;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, AES_KEY, AES_IV);
    let decrypted = decipher.update(String(cipherText), "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    // Return as-is if it wasn't encrypted (backward compat)
    return cipherText;
  }
}

/**
 * One-way SHA-256 hash (for integrity checks).
 * @param {string} data
 * @returns {string} hex digest
 */
function hashData(data) {
  if (!data) return data;
  return crypto.createHash("sha256").update(String(data)).digest("hex");
}

/**
 * Bcrypt hash a password.
 * @param {string} password
 * @returns {Promise<string>} hashed password
 */
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
  return bcrypt.hash(password, salt);
}

/**
 * Compare plaintext password against bcrypt hash.
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Encrypt multiple fields on an object.
 * Returns a new object with encrypted values + hash suffixed keys.
 */
function encryptFields(obj, fieldNames) {
  const result = { ...obj };
  for (const field of fieldNames) {
    if (result[field] !== undefined && result[field] !== null && result[field] !== "") {
      result[`${field}_hash`] = hashData(result[field]);
      result[field] = encryptData(result[field]);
    }
  }
  return result;
}

/**
 * Decrypt multiple fields on an object.
 * Returns a new object with decrypted values.
 */
function decryptFields(obj, fieldNames) {
  const result = { ...obj };
  for (const field of fieldNames) {
    if (result[field] !== undefined && result[field] !== null && result[field] !== "") {
      result[field] = decryptData(result[field]);
    }
    // Remove hash keys from output
    delete result[`${field}_hash`];
  }
  return result;
}

module.exports = {
  encryptData,
  decryptData,
  hashData,
  hashPassword,
  comparePassword,
  encryptFields,
  decryptFields,
};
