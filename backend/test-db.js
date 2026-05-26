const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { adminDb } = require("./utils/firebaseAdmin");

async function test() {
    try {
        console.log("Connecting to Firebase...");
        const snapshot = await adminDb.ref("users").limitToFirst(1).once("value");
        console.log("Got value:", snapshot.val());
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}
test();
