// ============================================================
// Firebase Admin SDK Initialization
// ============================================================
const admin = require("firebase-admin");
const path = require("path");

if (!admin.apps.length) {
    const serviceAccount = require(path.join(__dirname, "..", "serviceAccountKey.json"));

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL || "https://com1-e2378-default-rtdb.firebaseio.com",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "com1-e2378.firebasestorage.app",
    });
}

const adminDb = admin.database();
const adminAuth = admin.auth();
const adminFirestore = admin.firestore();

module.exports = {
    admin,
    adminDb,
    adminAuth,
    adminFirestore,
};
