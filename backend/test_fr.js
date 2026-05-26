// ============================================================
// FR Test Suite — Tests all newly implemented FR endpoints
// Run: node test_fr.js
// ============================================================
require("dotenv").config();
const http = require("http");
const https = require("https");

const BASE = "http://127.0.0.1:5000";
const JWT_SECRET = process.env.JWT_SECRET || "dc_jwt_s3cr3t_k3y_2026_xKp9mNqR7wL2";

// Generate a test JWT directly (bypassing Firebase Auth for testing)
const jwt = require("jsonwebtoken");

const TEST_USER_TOKEN = jwt.sign(
    { userId: "TEST_USER_001", email: "testuser@test.com", role: "user", initiatorStatus: "approved" },
    JWT_SECRET,
    { expiresIn: "1h" }
);
const TEST_ADMIN_TOKEN = jwt.sign(
    { userId: "TEST_ADMIN_001", email: "admin@test.com", role: "admin", initiatorStatus: "none" },
    JWT_SECRET,
    { expiresIn: "1h" }
);
const TEST_INITIATOR_TOKEN = jwt.sign(
    { userId: "TEST_INITIATOR_001", email: "initiator@test.com", role: "initiator", initiatorStatus: "approved" },
    JWT_SECRET,
    { expiresIn: "1h" }
);

// ─── HTTP Helper ─────────────────────────────────────────
function request(method, path, body = null, token = TEST_USER_TOKEN) {
    return new Promise((resolve) => {
        const bodyStr = body ? JSON.stringify(body) : null;
        const options = {
            hostname: "127.0.0.1",
            port: 5000,
            path,
            method,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
                ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
            },
            timeout: 8000,
        };

        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: { raw: data } });
                }
            });
        });

        req.on("error", (e) => resolve({ status: 0, body: { error: e.message } }));
        req.on("timeout", () => { req.destroy(); resolve({ status: 408, body: { error: "Timeout" } }); });

        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

// ─── Test Runner ─────────────────────────────────────────
const results = [];
let passed = 0, failed = 0, skipped = 0;

async function test(frId, title, fn) {
    try {
        const result = await fn();
        const ok = result === true;
        if (ok) {
            passed++;
            results.push({ fr: frId, title, status: "✅ PASS" });
            console.log(`✅ ${frId.padEnd(8)} ${title}`);
        } else {
            failed++;
            results.push({ fr: frId, title, status: "❌ FAIL", detail: result });
            console.log(`❌ ${frId.padEnd(8)} ${title} → ${JSON.stringify(result).slice(0, 100)}`);
        }
    } catch (e) {
        failed++;
        results.push({ fr: frId, title, status: "💥 ERROR", detail: e.message });
        console.log(`💥 ${frId.padEnd(8)} ${title} → ${e.message}`);
    }
}

// ─── Main Test Suite ──────────────────────────────────────
async function runTests() {
    console.log("\n══════════════════════════════════════════════════════");
    console.log("   FR TEST SUITE — Digital Committee Backend");
    console.log("══════════════════════════════════════════════════════\n");

    // ── HEALTH CHECK ──────────────────────────────────────
    console.log("─── INFRASTRUCTURE ─────────────────────────────────");
    await test("HEALTH", "Server is running and healthy", async () => {
        const r = await request("GET", "/api/health", null, TEST_ADMIN_TOKEN);
        return r.status === 200 && r.body.status === "ok" ? true : r.body;
    });

    // ── FR-59: NLP SENTIMENT ──────────────────────────────
    console.log("\n─── MODULE 5: RECOMMENDATION ───────────────────────");
    await test("FR-59", "NLP sentiment — positive text detected", async () => {
        const r = await request("POST", "/api/feedback/analyze",
            { text: "Great initiator, very reliable and honest!" });
        return r.status === 200 && r.body.sentiment === "positive" ? true : r.body;
    });

    await test("FR-59", "NLP sentiment — negative text detected", async () => {
        const r = await request("POST", "/api/feedback/analyze",
            { text: "Terrible fraud, very delayed and dishonest!" });
        return r.status === 200 && r.body.sentiment === "negative" ? true : r.body;
    });

    await test("FR-59", "NLP sentiment — neutral text detected", async () => {
        const r = await request("POST", "/api/feedback/analyze",
            { text: "The committee completed." });
        return r.status === 200 && r.body.sentiment === "neutral" ? true : r.body;
    });

    await test("FR-60", "Recommendations endpoint returns list", async () => {
        const r = await request("GET", "/api/feedback/recommend?limit=5");
        return r.status === 200 && r.body.success ? true : r.body;
    });

    await test("FR-58", "Recommend — returns initiators array", async () => {
        const r = await request("GET", "/api/feedback/recommend?limit=3");
        return r.status === 200 && Array.isArray(r.body.initiators) ? true : r.body;
    });

    // ── FR-87: Duplicate Rating Block ─────────────────────
    await test("FR-87", "Feedback submit — blocked if missing required fields", async () => {
        const r = await request("POST", "/api/feedback/submit", { initiatorId: "X" });
        return r.status === 400 ? true : r.body;
    });

    // ── FR-52/53/56: SEARCH & FILTER ─────────────────────
    console.log("\n─── MODULE 4: SEARCH & FILTER ──────────────────────");
    await test("FR-52", "Admin search users by name", async () => {
        const r = await request("GET", "/api/data/users/search?name=test", null, TEST_ADMIN_TOKEN);
        return r.status === 200 && r.body.success ? true : r.body;
    });

    await test("FR-52", "Non-admin blocked from user search", async () => {
        const r = await request("GET", "/api/data/users/search?name=test", null, TEST_USER_TOKEN);
        return r.status === 403 ? true : r.body;
    });

    await test("FR-53", "Search initiators by name", async () => {
        const r = await request("GET", "/api/data/initiators/search?name=test");
        return r.status === 200 && r.body.success ? true : r.body;
    });

    await test("FR-56", "Filter initiators by level range", async () => {
        const r = await request("GET", "/api/data/initiators/filter?minLevel=1&maxLevel=5");
        return r.status === 200 && r.body.success ? true : r.body;
    });

    await test("FR-56", "Filter initiators by rating range", async () => {
        const r = await request("GET", "/api/data/initiators/filter?minRating=3&maxRating=5");
        return r.status === 200 && r.body.success ? true : r.body;
    });

    await test("FR-76", "Track complaint — returns 404 for unknown ID", async () => {
        const r = await request("GET", "/api/data/complaint/FAKE_COMPLAINT_999");
        return r.status === 404 ? true : r.body;
    });

    // ── FR-31: Committee Lock ─────────────────────────────
    console.log("\n─── MODULE 2: COMMITTEE ────────────────────────────");
    await test("FR-31", "Lock committee — missing committeeId returns 400", async () => {
        const r = await request("POST", "/api/committee/lock", {});
        return r.status === 400 ? true : r.body;
    });

    await test("FR-31", "Lock committee — nonexistent committee returns 404", async () => {
        const r = await request("POST", "/api/committee/lock", { committeeId: "FAKE_CMT_999" });
        return r.status === 404 ? true : r.body;
    });

    await test("FR-32", "Generate turns — missing committeeId returns 400", async () => {
        const r = await request("POST", "/api/committee/generate-turns", {});
        return r.status === 400 ? true : r.body;
    });

    await test("FR-36", "Admin approve committee — non-admin returns 403", async () => {
        const r = await request("POST", "/api/committee/approve",
            { committeeId: "C1", action: "approve" }, TEST_USER_TOKEN);
        return r.status === 403 ? true : r.body;
    });

    await test("FR-36", "Admin approve — invalid action returns 400", async () => {
        const r = await request("POST", "/api/committee/approve",
            { committeeId: "C1", action: "invalid" }, TEST_ADMIN_TOKEN);
        return r.status === 400 ? true : r.body;
    });

    await test("FR-40", "Can-receive-payout — missing params returns 400", async () => {
        const r = await request("GET", "/api/committee/can-receive-payout");
        return r.status === 400 ? true : r.body;
    });

    await test("FR-43/44", "Payout — missing fields returns 400", async () => {
        const r = await request("POST", "/api/committee/payout", { committeeId: "C1" });
        return r.status === 400 ? true : r.body;
    });

    await test("FR-102", "Loan block check — initiator with no loans is not blocked", async () => {
        const r = await request("GET", "/api/committee/loan-block/FAKE_INITIATOR_999");
        return r.status === 200 && r.body.blocked === false ? true : r.body;
    });

    await test("FR-48/49", "Committee search — returns list", async () => {
        const r = await request("GET", "/api/committee/search?minAmount=1000&maxAmount=50000");
        return r.status === 200 && r.body.success ? true : r.body;
    });

    await test("FR-57", "Committee by payment status — non-admin blocked", async () => {
        const r = await request("GET", "/api/committee/by-payment-status?paymentStatus=unpaid", null, TEST_USER_TOKEN);
        return r.status === 403 ? true : r.body;
    });

    await test("FR-57", "Committee by payment status — admin allowed", async () => {
        const r = await request("GET", "/api/committee/by-payment-status?paymentStatus=unpaid", null, TEST_ADMIN_TOKEN);
        return r.status === 200 && r.body.success ? true : r.body;
    });

    // ── FR-42: Fines ──────────────────────────────────────
    console.log("\n─── MODULE 3: PAYMENT / FINES ──────────────────────");
    await test("FR-42", "Apply fine — missing fields returns 400", async () => {
        const r = await request("POST", "/api/payment/fine", { userId: "U1" });
        return r.status === 400 ? true : r.body;
    });

    await test("FR-51/55", "Filter payments — returns list", async () => {
        const r = await request("GET", "/api/payment/filter?status=approved", null, TEST_ADMIN_TOKEN);
        return r.status === 200 && r.body.success ? true : r.body;
    });

    await test("FR-67", "Notify pending — missing committeeId returns 400", async () => {
        const r = await request("POST", "/api/payment/notify-pending", {});
        return r.status === 400 ? true : r.body;
    });

    await test("FR-74", "Suspicious events — non-admin blocked", async () => {
        const r = await request("GET", "/api/payment/suspicious", null, TEST_USER_TOKEN);
        return r.status === 403 ? true : r.body;
    });

    await test("FR-74", "Suspicious events — admin allowed", async () => {
        const r = await request("GET", "/api/payment/suspicious", null, TEST_ADMIN_TOKEN);
        return r.status === 200 && r.body.success ? true : r.body;
    });

    // ── FR-98–105: Loan ────────────────────────────────────
    console.log("\n─── MODULE 11: LOANS ───────────────────────────────");
    await test("FR-98", "Loan eligibility — endpoint responds correctly", async () => {
        const r = await request("GET", "/api/loan/eligibility/TEST_USER_001");
        // 200 = user exists, 404 = user not in Firebase (both valid — route works)
        return (r.status === 200 && typeof r.body.eligible === "boolean") || r.status === 404 ? true : r.body;
    });

    await test("FR-98", "Loan eligibility — blocked for other user (non-admin)", async () => {
        const r = await request("GET", "/api/loan/eligibility/OTHER_USER_999", null, TEST_USER_TOKEN);
        return r.status === 403 ? true : r.body;
    });

    await test("FR-99", "Loan terms — 404 for unknown loan", async () => {
        const r = await request("GET", "/api/loan/terms/FAKE_LOAN_999");
        return r.status === 404 ? true : r.body;
    });

    await test("FR-100", "Loan disburse — non-admin blocked", async () => {
        const r = await request("POST", "/api/loan/disburse", { loanId: "L1" }, TEST_USER_TOKEN);
        return r.status === 403 ? true : r.body;
    });

    await test("FR-101", "Loan repay — missing loanId returns 400", async () => {
        const r = await request("POST", "/api/loan/repay", { amount: 5000 });
        return r.status === 400 ? true : r.body;
    });

    await test("FR-103", "Loan review — non-admin blocked", async () => {
        const r = await request("POST", "/api/loan/review",
            { loanId: "L1", action: "approve" }, TEST_USER_TOKEN);
        return r.status === 403 ? true : r.body;
    });

    await test("FR-104", "Loan monitor — non-admin blocked", async () => {
        const r = await request("GET", "/api/loan/monitor", null, TEST_USER_TOKEN);
        return r.status === 403 ? true : r.body;
    });

    await test("FR-104", "Loan monitor — admin gets list", async () => {
        const r = await request("GET", "/api/loan/monitor", null, TEST_ADMIN_TOKEN);
        return r.status === 200 && r.body.success ? true : r.body;
    });

    await test("FR-105", "Loan recover from earnings — non-admin blocked", async () => {
        const r = await request("POST", "/api/loan/recover-from-earnings",
            { loanId: "L1", initiatorId: "I1" }, TEST_USER_TOKEN);
        return r.status === 403 ? true : r.body;
    });

    await test("FR-72", "Loan notify overdue — non-admin blocked", async () => {
        const r = await request("POST", "/api/loan/notify-overdue", {}, TEST_USER_TOKEN);
        return r.status === 403 ? true : r.body;
    });

    await test("FR-72", "Loan notify overdue — admin runs successfully", async () => {
        const r = await request("POST", "/api/loan/notify-overdue", {}, TEST_ADMIN_TOKEN);
        return r.status === 200 && r.body.success ? true : r.body;
    });

    // ── FR-18/88–93: Level & Bonus ─────────────────────────
    console.log("\n─── MODULE 9: LEVEL & BONUS ────────────────────────");
    await test("FR-92", "Get bonus policy — returns policy object", async () => {
        const r = await request("GET", "/api/level/policy");
        return r.status === 200 && r.body.policy ? true : r.body;
    });

    await test("FR-92", "Set bonus policy — non-admin blocked", async () => {
        const r = await request("POST", "/api/level/policy",
            { levelUpEvery: 3, bonusPerLevel: 500, level5Earning: 200 }, TEST_USER_TOKEN);
        return r.status === 403 ? true : r.body;
    });

    await test("FR-92", "Set bonus policy — admin allowed", async () => {
        const r = await request("POST", "/api/level/policy",
            { levelUpEvery: 3, bonusPerLevel: 500, level5Earning: 200 }, TEST_ADMIN_TOKEN);
        return r.status === 200 && r.body.success ? true : r.body;
    });

    await test("FR-18", "Level check — endpoint responds correctly", async () => {
        const r = await request("POST", "/api/level/check-levelup", { initiatorId: "TEST_USER_001" });
        // 200 = user exists & returned level data, 404 = user not in Firebase (route works)
        return r.status === 200 || r.status === 404 ? true : r.body;
    });

    await test("FR-89/90", "Credit earnings — endpoint responds (fails below level 5 or no user)", async () => {
        const r = await request("POST", "/api/level/credit-earnings",
            { initiatorId: "TEST_USER_001", committeeId: "C1" });
        // 400 = not level 5, 404 = user not found — both are correct route responses
        return r.status === 400 || r.status === 404 || r.status === 200 ? true : r.body;
    });

    await test("FR-89/90", "Get earnings — returns balance", async () => {
        const r = await request("GET", "/api/level/earnings/TEST_USER_001");
        return r.status === 200 && r.body.success ? true : r.body;
    });

    await test("FR-93", "Freeze rewards — non-admin blocked", async () => {
        const r = await request("POST", "/api/level/freeze",
            { initiatorId: "I1", action: "freeze" }, TEST_USER_TOKEN);
        return r.status === 403 ? true : r.body;
    });

    await test("FR-93", "Freeze rewards — invalid action returns 400", async () => {
        const r = await request("POST", "/api/level/freeze",
            { initiatorId: "I1", action: "invalidAction" }, TEST_ADMIN_TOKEN);
        return r.status === 400 ? true : r.body;
    });

    // ── FR-80–84: Warnings ─────────────────────────────────
    console.log("\n─── MODULE 8: WARNINGS ─────────────────────────────");
    await test("FR-82", "Issue warning — missing fields returns 400", async () => {
        const r = await request("POST", "/api/warning/issue", { memberId: "U1" });
        return r.status === 400 ? true : r.body;
    });

    await test("FR-80", "Get user warnings — returns list for self", async () => {
        const r = await request("GET", "/api/warning/user/TEST_USER_001");
        return r.status === 200 && r.body.success ? true : r.body;
    });

    await test("FR-80", "Get user warnings — blocked for other user", async () => {
        const r = await request("GET", "/api/warning/user/OTHER_USER_999", null, TEST_USER_TOKEN);
        return r.status === 403 ? true : r.body;
    });

    await test("FR-83", "Admin pay — non-admin blocked", async () => {
        const r = await request("POST", "/api/warning/admin-pay",
            { userId: "U1", committeeId: "C1", amount: 1000 }, TEST_USER_TOKEN);
        return r.status === 403 ? true : r.body;
    });

    await test("FR-83", "Admin pay — missing fields returns 400", async () => {
        const r = await request("POST", "/api/warning/admin-pay",
            { userId: "U1" }, TEST_ADMIN_TOKEN);
        return r.status === 400 ? true : r.body;
    });

    await test("FR-84", "Admin recover — missing tempPaymentId returns 400", async () => {
        const r = await request("POST", "/api/warning/recover", {}, TEST_ADMIN_TOKEN);
        return r.status === 400 ? true : r.body;
    });

    await test("FR-84", "Admin payments list — non-admin blocked", async () => {
        const r = await request("GET", "/api/warning/admin-payments", null, TEST_USER_TOKEN);
        return r.status === 403 ? true : r.body;
    });

    await test("FR-84", "Admin payments list — admin gets list", async () => {
        const r = await request("GET", "/api/warning/admin-payments", null, TEST_ADMIN_TOKEN);
        return r.status === 200 && r.body.success ? true : r.body;
    });

    // ── FR-33–35, 94–96: Turn System ──────────────────────
    console.log("\n─── MODULE 10: TURNS ───────────────────────────────");
    await test("FR-94", "Turn request — missing fields returns 400", async () => {
        const r = await request("POST", "/api/turn/request", { committeeId: "C1" });
        return r.status === 400 ? true : r.body;
    });

    await test("FR-95", "Priority turn — missing fields returns 400", async () => {
        const r = await request("POST", "/api/turn/priority-request", { committeeId: "C1" });
        return r.status === 400 ? true : r.body;
    });

    await test("FR-33/96", "Handle turn request — invalid action returns 400", async () => {
        const r = await request("POST", "/api/turn/handle",
            { requestId: "R1", action: "maybeyes" });
        return r.status === 400 ? true : r.body;
    });

    await test("FR-34", "Swap turns — missing fields returns 400", async () => {
        const r = await request("POST", "/api/turn/swap", { committeeId: "C1" });
        return r.status === 400 ? true : r.body;
    });

    await test("FR-32", "Get turns — returns array for committee", async () => {
        const r = await request("GET", "/api/turn/FAKE_CMT_999");
        return r.status === 200 && r.body.success ? true : r.body;
    });

    await test("FR-33", "Get turn requests — returns list", async () => {
        const r = await request("GET", "/api/turn/requests/FAKE_CMT_999");
        return r.status === 200 && r.body.success ? true : r.body;
    });

    // ── FR-61–74: Notifications ────────────────────────────
    console.log("\n─── MODULE 6: NOTIFICATIONS ────────────────────────");
    await test("FR-61/62/63", "Payment due reminder — runs without committee", async () => {
        const r = await request("POST", "/api/notification/remind-due", {});
        return r.status === 200 && r.body.success ? true : r.body;
    });

    await test("FR-64", "Committee event — missing fields returns 400", async () => {
        const r = await request("POST", "/api/notification/committee-event", { event: "created" });
        return r.status === 400 ? true : r.body;
    });

    await test("FR-71", "Complaint notification — admin notified successfully", async () => {
        const r = await request("POST", "/api/notification/complaint",
            { complainantId: "U1", summary: "Test complaint" });
        return r.status === 200 && r.body.success ? true : r.body;
    });

    await test("FR-73", "Bonus pending — admin notified successfully", async () => {
        const r = await request("POST", "/api/notification/bonus-pending",
            { initiatorId: "I1", amount: 500, reason: "Level up bonus" });
        return r.status === 200 && r.body.success ? true : r.body;
    });

    await test("FR-65/66", "Get user notifications — returns list", async () => {
        const r = await request("GET", "/api/notification/user/TEST_USER_001");
        return r.status === 200 && r.body.success ? true : r.body;
    });

    await test("FR-65/66", "Mark notification read — missing fields returns 400", async () => {
        const r = await request("POST", "/api/notification/mark-read", { userId: "U1" });
        return r.status === 400 ? true : r.body;
    });

    // ── SUMMARY ───────────────────────────────────────────
    console.log("\n══════════════════════════════════════════════════════");
    console.log(`   RESULTS: ${passed} PASSED  |  ${failed} FAILED  |  ${skipped} SKIPPED`);
    console.log(`   Total Tests: ${results.length}`);
    console.log("══════════════════════════════════════════════════════\n");

    if (failed > 0) {
        console.log("─── FAILED TESTS ────────────────────────────────────");
        results.filter(r => r.status.startsWith("❌") || r.status.startsWith("💥")).forEach(r => {
            console.log(`  ${r.fr.padEnd(10)} ${r.title}`);
            if (r.detail) console.log(`             Detail: ${JSON.stringify(r.detail).slice(0, 120)}`);
        });
    }

    console.log("\n─── PASS RATE ───────────────────────────────────────");
    const rate = Math.round((passed / results.length) * 100);
    const bar = "█".repeat(Math.floor(rate / 5)) + "░".repeat(20 - Math.floor(rate / 5));
    console.log(`  [${bar}] ${rate}%\n`);

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error("Test suite crashed:", err);
    process.exit(1);
});
