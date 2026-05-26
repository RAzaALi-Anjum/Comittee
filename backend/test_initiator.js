/**
 * Initiator Payment Verification System Integration Test
 * Run: node test_initiator.js
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const { generateAccessToken } = require("./middleware/auth");
const { adminDb, adminFirestore } = require("./utils/firebaseAdmin");
const { encryptFields, decryptData } = require("./utils/encryption");

const BASE_URL = "http://127.0.0.1:5000";
const TEST_USER_ID = "test_initiator_user_id";
const TEST_ADMIN_ID = "test_initiator_admin_id";

let passed = 0;
let failed = 0;
let createdFiles = [];

function log(status, name, details = "") {
    const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️";
    console.log(`${icon} ${name}${details ? ` — ${details}` : ""}`);
    if (status === "PASS") passed++;
    else if (status === "FAIL") failed++;
}

function httpRequest(method, urlPath, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                "Content-Type": "application/json",
                ...headers,
            },
            timeout: 10000,
        };
        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data), raw: data });
                } catch {
                    resolve({ status: res.statusCode, body: null, raw: data });
                }
            });
        });
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function uploadMultipart(urlPath, fields, fileField, filePath, headers = {}) {
    return new Promise((resolve, reject) => {
        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        const url = new URL(urlPath, BASE_URL);
        
        let payload = Buffer.alloc(0);
        
        // Add text fields
        for (const [key, val] of Object.entries(fields)) {
            let part = `--${boundary}\r\n`;
            part += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
            part += `${val}\r\n`;
            payload = Buffer.concat([payload, Buffer.from(part, 'utf8')]);
        }
        
        // Add file field
        const filename = path.basename(filePath);
        let fileHeader = `--${boundary}\r\n`;
        fileHeader += `Content-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\n`;
        fileHeader += `Content-Type: image/png\r\n\r\n`;
        payload = Buffer.concat([payload, Buffer.from(fileHeader, 'utf8')]);
        
        // Read file contents
        const fileData = fs.readFileSync(filePath);
        payload = Buffer.concat([payload, fileData]);
        
        // Add footer
        const footer = `\r\n--${boundary}--\r\n`;
        payload = Buffer.concat([payload, Buffer.from(footer, 'utf8')]);
        
        const reqOpts = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: "POST",
            headers: {
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
                "Content-Length": payload.length,
                ...headers
            }
        };
        
        const req = http.request(reqOpts, (res) => {
            let body = "";
            res.on("data", chunk => body += chunk);
            res.on("end", () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(body), raw: body });
                } catch (e) {
                    resolve({ status: res.statusCode, body: null, raw: body });
                }
            });
        });
        
        req.on("error", reject);
        req.write(payload);
        req.end();
    });
}

// Prepare encryption keys for sensitive fields matching database logic
const SENSITIVE_FIELDS = ["fullName", "email", "contactNumber"];

async function runTests() {
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║ Initiator Payment Verification System Test  ║");
    console.log("╚══════════════════════════════════════════════╝\n");

    // 1. Generate JWT tokens
    const userToken = generateAccessToken({ userId: TEST_USER_ID, email: "test_user@gmail.com", role: "user" });
    const adminToken = generateAccessToken({ userId: TEST_ADMIN_ID, email: "test_admin@gmail.com", role: "admin" });
    
    // Create temporary image file for upload proof
    const tempImgPath = path.join(__dirname, "temp_proof.png");
    fs.writeFileSync(tempImgPath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
    createdFiles.push(tempImgPath);

    // Mock profiles in Firebase Realtime Database
    const mockUserProfile = encryptFields({
        fullName: "Test Initiator Candidate",
        email: "test_user@gmail.com",
        contactNumber: "03001234567",
        role: "user",
        is_initiator: false,
        wallet_balance: 1000,
        initiatorStatus: "none"
    }, SENSITIVE_FIELDS);

    const mockAdminProfile = encryptFields({
        fullName: "System Admin User",
        email: "test_admin@gmail.com",
        role: "admin",
        is_initiator: false,
        wallet_balance: 0
    }, SENSITIVE_FIELDS);

    try {
        console.log("Setting up mock database entries...");
        await adminDb.ref(`users/${TEST_USER_ID}`).set(mockUserProfile);
        await adminDb.ref(`users/${TEST_ADMIN_ID}`).set(mockAdminProfile);
        await adminFirestore.collection("users").doc(TEST_USER_ID).set({
            role: "user",
            is_initiator: false,
            initiatorStatus: "none"
        });

        // ═══════════════════════════════════════════════════════════
        // TEST 1: Submit Payment (User)
        // ═══════════════════════════════════════════════════════════
        console.log("\n── 1. Submit payment proof via POST /submit ────");
        
        const submitFields = {
            amount: "5000",
            transaction_id: "TXN_INIT_999",
            method: "Easypaisa"
        };
        
        const resSubmit = await uploadMultipart(
            "/api/payment/initiator/submit",
            submitFields,
            "proof",
            tempImgPath,
            { Authorization: `Bearer ${userToken}` }
        );

        let firstPaymentId = null;
        if (resSubmit.status === 200 && resSubmit.body?.success) {
            firstPaymentId = resSubmit.body.paymentId;
            log("PASS", "Payment submitted successfully", `paymentId: ${firstPaymentId}`);
            
            // Verify backend saved file mapping
            const savedFilename = path.basename(resSubmit.body.message || ""); // extraction helper (mock image upload server URL check)
            
            // Fetch database directly to verify record structure
            const dbSnap = await adminDb.ref(`payments/${firstPaymentId}`).once("value");
            const payment = dbSnap.val();
            
            if (payment && payment.amount === 5000 && payment.transaction_id === "TXN_INIT_999" && payment.status === "pending") {
                log("PASS", "Payment record saved in RTDB with correct properties");
            } else {
                log("FAIL", "Payment record verification in RTDB failed", JSON.stringify(payment));
            }

            // Verify admin notification
            const adminNotifSnap = await adminDb.ref("notifications/ADMIN").once("value");
            const adminNotifs = adminNotifSnap.val();
            let hasNewNotif = false;
            if (adminNotifs) {
                hasNewNotif = Object.values(adminNotifs).some(n => {
                    try {
                        const title = decryptData(n.title);
                        const msg = decryptData(n.message);
                        return title === "New Initiator Payment" && n.sentBy === TEST_USER_ID;
                    } catch (e) { return false; }
                });
            }
            if (hasNewNotif) {
                log("PASS", "Encrypted notification successfully sent to Admin queue");
            } else {
                log("FAIL", "Admin notification for payment submission not found/failed to decrypt");
            }
        } else {
            log("FAIL", "Submit payment endpoint failed", `Status: ${resSubmit.status}, Body: ${JSON.stringify(resSubmit.body)}`);
        }

        // ═══════════════════════════════════════════════════════════
        // TEST 2: Status check (User)
        // ═══════════════════════════════════════════════════════════
        console.log("\n── 2. Get status check via GET /status/:userId ─");
        
        const resStatus = await httpRequest(
            "GET",
            `/api/payment/initiator/status/${TEST_USER_ID}`,
            null,
            { Authorization: `Bearer ${userToken}` }
        );

        if (resStatus.status === 200 && resStatus.body?.success && resStatus.body?.payment) {
            const p = resStatus.body.payment;
            if (p.status === "pending" && p.amount === 5000) {
                log("PASS", "Payment status retrieved successfully as pending");
            } else {
                log("FAIL", "Payment status properties mismatch", JSON.stringify(p));
            }
        } else {
            log("FAIL", "Get status endpoint failed", `Status: ${resStatus.status}, Body: ${JSON.stringify(resStatus.body)}`);
        }

        // ═══════════════════════════════════════════════════════════
        // TEST 3: Access control checks (User trying to access Admin pending list)
        // ═══════════════════════════════════════════════════════════
        console.log("\n── 3. Security role restrictions check ──────────");
        const resPendingForbid = await httpRequest(
            "GET",
            "/api/payment/initiator/pending",
            null,
            { Authorization: `Bearer ${userToken}` }
        );

        if (resPendingForbid.status === 403) {
            log("PASS", "User role cannot access /pending list (HTTP 403)");
        } else {
            log("FAIL", "Access should be forbidden, got status: " + resPendingForbid.status);
        }

        // ═══════════════════════════════════════════════════════════
        // TEST 4: Get pending list (Admin)
        // ═══════════════════════════════════════════════════════════
        console.log("\n── 4. Retrieve pending payments via GET /pending ─");
        
        const resPending = await httpRequest(
            "GET",
            "/api/payment/initiator/pending",
            null,
            { Authorization: `Bearer ${adminToken}` }
        );

        if (resPending.status === 200 && resPending.body?.success && Array.isArray(resPending.body.payments)) {
            const list = resPending.body.payments;
            const found = list.find(p => p.paymentId === firstPaymentId);
            if (found) {
                log("PASS", "Pending initiator payments list contains the new payment");
                
                // Verify decryption of user details in pending response
                if (found.userInfo && found.userInfo.name === "Test Initiator Candidate" && found.userInfo.email === "test_user@gmail.com") {
                    log("PASS", "Decrypted candidate user fields present in admin overview");
                } else {
                    log("FAIL", "Decrypted user fields are incorrect or missing", JSON.stringify(found.userInfo));
                }
            } else {
                log("FAIL", "Submitted payment not found in pending list");
            }
        } else {
            log("FAIL", "Get pending payments list failed", `Status: ${resPending.status}, Body: ${JSON.stringify(resPending.body)}`);
        }

        // ═══════════════════════════════════════════════════════════
        // TEST 5: Verify Rejection (Admin)
        // ═══════════════════════════════════════════════════════════
        console.log("\n── 5. Verify payment rejection via POST /verify ─");
        
        // Submit a second payment to reject
        const resSubmit2 = await uploadMultipart(
            "/api/payment/initiator/submit",
            { amount: "5000", transaction_id: "TXN_INIT_REJECT", method: "JazzCash" },
            "proof",
            tempImgPath,
            { Authorization: `Bearer ${userToken}` }
        );
        
        if (resSubmit2.status === 200 && resSubmit2.body?.success) {
            const secondPaymentId = resSubmit2.body.paymentId;
            
            // Reject the second payment
            const resReject = await httpRequest(
                "POST",
                "/api/payment/initiator/verify",
                { paymentId: secondPaymentId, action: "reject" },
                { Authorization: `Bearer ${adminToken}` }
            );
            
            if (resReject.status === 200 && resReject.body?.success) {
                log("PASS", "Verify reject request returned success");
                
                // Verify payment status in database is rejected
                const dbSnap = await adminDb.ref(`payments/${secondPaymentId}`).once("value");
                const payment = dbSnap.val();
                if (payment && payment.status === "rejected") {
                    log("PASS", "Payment status updated to rejected in RTDB");
                } else {
                    log("FAIL", "Payment status was not updated to rejected", JSON.stringify(payment));
                }
                
                // Verify role and wallet unchanged
                const userSnap = await adminDb.ref(`users/${TEST_USER_ID}`).once("value");
                const user = userSnap.val();
                if (user && user.role === "user" && user.is_initiator === false && user.wallet_balance === 1000) {
                    log("PASS", "User role, initiator status and wallet balance remained unchanged");
                } else {
                    log("FAIL", "User fields were unexpectedly modified on rejection", JSON.stringify(user));
                }

                // Verify user received notification
                const userNotifSnap = await adminDb.ref(`notifications/${TEST_USER_ID}`).once("value");
                const userNotifs = userNotifSnap.val();
                let hasRejectNotif = false;
                if (userNotifs) {
                    hasRejectNotif = Object.values(userNotifs).some(n => {
                        try {
                            const title = decryptData(n.title);
                            const msg = decryptData(n.message);
                            return title === "Initiator Fee Rejected" && n.type === "error";
                        } catch (e) { return false; }
                    });
                }
                if (hasRejectNotif) {
                    log("PASS", "Encrypted rejection notification sent to User queue");
                } else {
                    log("FAIL", "User rejection notification missing or failed decryption");
                }
            } else {
                log("FAIL", "Verify reject request failed", `Status: ${resReject.status}, Body: ${JSON.stringify(resReject.body)}`);
            }
        } else {
            log("FAIL", "Failed to submit second payment for rejection test");
        }

        // ═══════════════════════════════════════════════════════════
        // TEST 6: Verify Approval (Admin)
        // ═══════════════════════════════════════════════════════════
        console.log("\n── 6. Verify payment approval via POST /verify ─");
        
        const resApprove = await httpRequest(
            "POST",
            "/api/payment/initiator/verify",
            { paymentId: firstPaymentId, action: "approve" },
            { Authorization: `Bearer ${adminToken}` }
        );

        if (resApprove.status === 200 && resApprove.body?.success) {
            log("PASS", "Verify approve request returned success");
            
            // Verify payment status in database is approved
            const dbSnap = await adminDb.ref(`payments/${firstPaymentId}`).once("value");
            const payment = dbSnap.val();
            if (payment && payment.status === "approved") {
                log("PASS", "Payment status updated to approved in RTDB");
            } else {
                log("FAIL", "Payment status was not updated to approved", JSON.stringify(payment));
            }
            
            // Verify user role promoted and wallet credited in RTDB
            const userSnap = await adminDb.ref(`users/${TEST_USER_ID}`).once("value");
            const user = userSnap.val();
            if (user && user.role === "initiator" && user.is_initiator === true && user.initiatorStatus === "approved" && user.wallet_balance === 6000) {
                log("PASS", "User role updated to initiator, status approved, wallet credited +5000 (total: 6000)");
            } else {
                log("FAIL", "User fields was not correctly updated in RTDB", JSON.stringify(user));
            }

            // Verify Firestore record promotes consistency
            const fsDoc = await adminFirestore.collection("users").doc(TEST_USER_ID).get();
            if (fsDoc.exists) {
                const fsUser = fsDoc.data();
                if (fsUser.role === "initiator" && fsUser.is_initiator === true && fsUser.initiatorStatus === "approved") {
                    log("PASS", "Firestore user profile promoted to initiator matches RTDB updates");
                } else {
                    log("FAIL", "Firestore user profile fields out of sync with RTDB", JSON.stringify(fsUser));
                }
            } else {
                log("FAIL", "Firestore user document missing");
            }

            // Verify wallet transactions ledger record created
            const txSnap = await adminDb.ref("wallet_transactions").once("value");
            const txs = txSnap.val();
            let hasLedgerWrite = false;
            if (txs) {
                hasLedgerWrite = Object.values(txs).some(t => 
                    t.user_id === TEST_USER_ID && 
                    t.amount === 5000 && 
                    t.type === "credit" && 
                    t.source === "Initiator Fee Approval"
                );
            }
            if (hasLedgerWrite) {
                log("PASS", "Wallet transaction ledger logging record verified");
            } else {
                log("FAIL", "Wallet credit transaction record missing in wallet_transactions queue");
            }

            // Verify user received approval notification
            const userNotifSnap = await adminDb.ref(`notifications/${TEST_USER_ID}`).once("value");
            const userNotifs = userNotifSnap.val();
            let hasApproveNotif = false;
            if (userNotifs) {
                hasApproveNotif = Object.values(userNotifs).some(n => {
                    try {
                        const title = decryptData(n.title);
                        const msg = decryptData(n.message);
                        return title === "Initiator Fee Approved" && n.type === "success";
                    } catch (e) { return false; }
                });
            }
            if (hasApproveNotif) {
                log("PASS", "Encrypted approval notification sent to User queue");
            } else {
                log("FAIL", "User approval notification missing or failed decryption");
            }
        } else {
            log("FAIL", "Verify approve request failed", `Status: ${resApprove.status}, Body: ${JSON.stringify(resApprove.body)}`);
        }

    } catch (err) {
        log("FAIL", "Exception occurred during testing", err.stack);
    } finally {
        // Clean up DB records
        console.log("\nCleaning up database modifications...");
        try {
            await adminDb.ref(`users/${TEST_USER_ID}`).remove();
            await adminDb.ref(`users/${TEST_ADMIN_ID}`).remove();
            await adminFirestore.collection("users").doc(TEST_USER_ID).delete();

            // Fetch and remove all mock payments
            const paySnap = await adminDb.ref("payments").once("value");
            const payments = paySnap.val();
            if (payments) {
                for (const [id, p] of Object.entries(payments)) {
                    if (p.user_id === TEST_USER_ID || p.userId === TEST_USER_ID) {
                        await adminDb.ref(`payments/${id}`).remove();
                        // Clean up upload image if local
                        if (p.proof_image && p.proof_image.includes("/uploads/")) {
                            const filename = p.proof_image.split("/uploads/")[1];
                            const localFilePath = path.join(__dirname, "uploads", "files", filename);
                            if (fs.existsSync(localFilePath)) {
                                fs.unlinkSync(localFilePath);
                            }
                        }
                    }
                }
            }

            // Clean up admin notifications
            const adminNotifSnap = await adminDb.ref("notifications/ADMIN").once("value");
            const adminNotifs = adminNotifSnap.val();
            if (adminNotifs) {
                for (const [id, n] of Object.entries(adminNotifs)) {
                    if (n.sentBy === TEST_USER_ID) {
                        await adminDb.ref(`notifications/ADMIN/${id}`).remove();
                    }
                }
            }

            // Clean up user notifications
            await adminDb.ref(`notifications/${TEST_USER_ID}`).remove();

            // Clean up wallet transactions
            const txSnap = await adminDb.ref("wallet_transactions").once("value");
            const txs = txSnap.val();
            if (txs) {
                for (const [id, t] of Object.entries(txs)) {
                    if (t.user_id === TEST_USER_ID) {
                        await adminDb.ref(`wallet_transactions/${id}`).remove();
                    }
                }
            }

            console.log("Database clean up complete.");
        } catch (e) {
            console.error("Error during cleanup:", e);
        }

        // Clean up temporary files
        for (const file of createdFiles) {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        }
    }

    console.log("\n╔══════════════════════════════════════════════╗");
    console.log(`║  Results: ${passed} PASSED  |  ${failed} FAILED               ║`);
    console.log(`║  Total:   ${passed + failed} tests                            ║`);
    console.log("╚══════════════════════════════════════════════╝\n");

    process.exit(failed > 0 ? 1 : 0);
}

runTests();
