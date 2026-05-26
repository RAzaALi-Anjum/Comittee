// ============================================================
// OCR Routes — CNIC Verification System via GPT-4o Vision
// ============================================================
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");
const { encryptData, hashData, encryptFields } = require("../utils/encryption");
const { adminDb } = require("../utils/firebaseAdmin");
const { optionalToken } = require("../middleware/auth");
const { logEvent } = require("../utils/auditLogger");

const router = express.Router();

// ─── OpenAI Client ──────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── FILE UPLOAD CONFIG ─────────────────────────────────
const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, `cnic-${uniqueSuffix}${path.extname(file.originalname)}`);
    },
});

const fileFilter = (req, file, cb) => {
    // Accept by MIME type OR by extension (iOS sends HEIC/HEIF which may appear as octet-stream)
    const allowedMimes = [
        "image/jpeg", "image/jpg", "image/png",
        "image/bmp", "image/tiff",
        "image/heic", "image/heif",
        "application/octet-stream", // some iOS devices send this for HEIC
    ];
    const allowedExts = [".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".heic", ".heif"];
    const ext = path.extname(file.originalname || "").toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type '${file.mimetype}'. Only JPEG, PNG, BMP, TIFF, and HEIC images are allowed.`), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB max (HEIC files can be larger)
});

// ─── LOCATION CODE MAPPING ──────────────────────────────
const CNIC_LOCATION_MAP = {
    "10": ["Peshawar", "Charsadda", "Nowshera", "Mardan", "KPK"],
    "11": ["Abbottabad", "Mansehra", "Haripur", "Hazara"],
    "12": ["Swat", "Malakand", "Dir", "Chitral"],
    "13": ["DI Khan", "Bannu", "Lakki Marwat"],
    "14": ["Kohat", "Karak", "Hangu"],
    "15": ["Swabi", "Buner", "Shangla"],
    "16": ["Battagram", "Kohistan"],
    "21": ["Karachi", "Karachi South", "Karachi East", "Karachi West", "Karachi Central"],
    "22": ["Hyderabad", "Matiari", "Tando Allahyar", "Tando Muhammad Khan"],
    "23": ["Sukkur", "Khairpur", "Ghotki"],
    "24": ["Larkana", "Kambar", "Qambar", "Shahdadkot"],
    "25": ["Mirpurkhas", "Umerkot", "Tharparkar"],
    "26": ["Shaheed Benazirabad", "Nawabshah", "Naushahro Feroze"],
    "27": ["Jacobabad", "Kashmore", "Kandhkot"],
    "31": ["Quetta", "Pishin", "Ziarat"],
    "32": ["Turbat", "Gwadar", "Kech"],
    "33": ["Khuzdar", "Kalat", "Mastung"],
    "34": ["Gujranwala", "Sialkot", "Gujrat", "Narowal", "Hafizabad", "Mandi Bahauddin"],
    "35": ["Lahore", "Sheikhupura", "Nankana Sahib"],
    "36": ["Faisalabad", "Jhang", "Toba Tek Singh", "Chiniot"],
    "37": ["Sargodha", "Khushab", "Mianwali", "Bhakkar"],
    "38": ["Sahiwal", "Okara", "Pakpattan"],
    "41": ["Multan", "Khanewal", "Lodhran", "Vehari"],
    "42": ["Bahawalpur", "Bahawalnagar", "Rahim Yar Khan"],
    "43": ["DG Khan", "Rajanpur", "Muzaffargarh", "Layyah"],
    "44": ["Rawalpindi", "Chakwal", "Attock", "Jhelum"],
    "45": ["Gujranwala", "Sialkot"],
    "51": ["Islamabad", "ICT"],
    "54": ["Kasur", "Sheikhupura"],
    "61": ["AJK", "Mirpur", "Bhimber", "Kotli"],
    "62": ["AJK", "Muzaffarabad", "Neelum", "Jhelum Valley"],
    "71": ["Gilgit", "Hunza", "Nagar"],
    "72": ["Skardu", "Shigar", "Ghanche"],
    "73": ["Diamer", "Astore"],
    "74": ["Ghizer"],
};

// ─── VALIDATION HELPERS ──────────────────────────────────

function isValidCNICFormat(cnic) {
    return /^\d{5}-\d{7}-\d$/.test(cnic);
}

function isFirstDigitValid(cnic) {
    const firstDigit = parseInt(cnic[0]);
    return firstDigit >= 1 && firstDigit <= 7;
}

function isFakePattern(cnic) {
    const digits = cnic.replace(/-/g, "");
    // All same digits
    if (/^(\d)\1{12}$/.test(digits)) return true;
    // Sequential ascending (e.g. 1234567890123)
    const ascending = "01234567890123456789";
    if (ascending.includes(digits)) return true;
    // Sequential descending
    const descending = "98765432109876543210";
    if (descending.includes(digits)) return true;
    return false;
}

function checkLocationConsistency(cnic, address) {
    if (!address || !cnic) return { consistent: true, issues: [] };

    const areaCode = cnic.substring(0, 2);
    const knownCities = CNIC_LOCATION_MAP[areaCode];

    if (!knownCities) {
        return { consistent: false, issues: [`Unknown area code '${areaCode}' in CNIC`] };
    }

    const addressLower = address.toLowerCase();
    const match = knownCities.some((city) => addressLower.includes(city.toLowerCase()));

    if (!match) {
        return {
            consistent: false,
            issues: [
                `CNIC area code '${areaCode}' maps to [${knownCities.slice(0, 3).join(", ")}] but address says: "${address}"`,
            ],
        };
    }

    return { consistent: true, issues: [] };
}

// ─── GPT-4o CNIC VERIFICATION ───────────────────────────
async function verifyCNICWithGPT(imagePaths) {
    const imageContents = [];

    for (const imgPath of imagePaths) {
        const imageBuffer = fs.readFileSync(imgPath);
        const base64Image = imageBuffer.toString("base64");
        const ext = path.extname(imgPath).toLowerCase().replace(".", "");

        // Determine MIME type — treat HEIC/HEIF as JPEG for GPT-4o (it can decode both)
        let mimeType = "image/jpeg";
        if (ext === "png") mimeType = "image/png";
        else if (ext === "bmp") mimeType = "image/bmp";
        else if (ext === "tiff" || ext === "tif") mimeType = "image/tiff";
        // HEIC/HEIF: send as jpeg — GPT-4o handles it

        imageContents.push({
            type: "image_url",
            image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: "high",
            },
        });
    }

    const systemPrompt = `You are an automated CNIC verification system for Pakistani National Identity Cards.

The user has uploaded CNIC images (Front and optionally Back).

Your job is to:
1. Extract all possible information from the CNIC images.
2. Validate the CNIC using strict logical rules.
3. Detect inconsistencies and possible fraud.

TASKS:

1. DATA EXTRACTION:
   - Extract: CNIC Number (format: XXXXX-XXXXXXX-X), Full Name, Father Name, Date of Birth, Date of Issue, Date of Expiry, Gender.
   - Address Extraction & Translation: CNIC addresses are written in Urdu and are ONLY located on the back side of the Pakistani CNIC card.
     - Look specifically at the back side of the card. If only the front side of the card is uploaded, or if the address is not visible, set both "address" and "address_urdu" to null. NEVER guess, hallucinate, or use other visible text (like name, father's name, or seals) as the address.
     - Locate the sections starting with the Urdu labels "عارضی پتہ" (Temporary Address) and/or "مستقل پتہ" (Permanent Address). The address text is the Urdu text immediately following these labels.
     - Extract the raw Urdu address text for the Temporary Address (عارضی پتہ). If the Temporary Address is not present or blank, extract the Permanent Address (مستقل پتہ).
     - Ensure you do NOT extract other fields (like Father's name, issue dates, signatures, card numbers, or authority seals) as the address.
     - Clean and normalize the extracted Urdu text: remove noise, formatting symbols, extra spaces.
     - Translate/transliterate the Urdu address into formatted English (e.g., translate "مکان نمبر" to "House No.", "گلی نمبر" to "Street No.", "محلہ" to "Mohallah/Sector", etc.). Ensure proper English formatting.
     - Provide the translated English address in the "address" field.
     - Under no circumstances should the "address" field contain Urdu script characters (Arabic/Persian Unicode characters). The "address" field MUST contain ONLY English letters, numbers, and symbols. If translation is not possible, set "address" to null.
     - Provide the raw extracted Urdu address in the "address_urdu" field.
   - Transliterate other Urdu text (like Full Name and Father Name) to English. Do not return Urdu script characters for fields other than "address_urdu".
   - If multiple values found, choose the most likely correct one.

2. FORMAT VALIDATION:
   - CNIC must follow: 5 digits - 7 digits - 1 digit, total 13 digits.
   - If format fails → mark INVALID.

3. STRUCTURE CHECK:
   - First digit must be between 1–7.
   - Reject clearly fake patterns: all same digits, sequential patterns.

4. OCR CONFIDENCE CHECK:
   - If OCR text is unclear, blurry, or incomplete → mark SUSPICIOUS and lower confidence.

5. OVERALL ASSESSMENT:
   - INVALID → format wrong or clearly fake.
   - SUSPICIOUS → mismatch, unclear data, or partial extraction.
   - VALID → format correct + all fields extracted + no mismatches.

OUTPUT FORMAT (STRICT JSON ONLY — no markdown, no explanation):
{
  "cnic_number": "XXXXX-XXXXXXX-X or null",
  "name": "English full name or null",
  "father_name": "English father name or null",
  "date_of_birth": "YYYY-MM-DD or null",
  "date_of_issue": "YYYY-MM-DD or null",
  "date_of_expiry": "YYYY-MM-DD or null",
  "gender": "Male or Female or null",
  "address": "English full address or null",
  "address_urdu": "Raw Urdu address or null",
  "city": "English city name or null",
  "ocr_quality": "CLEAR | PARTIAL | BLURRY",
  "status": "VALID | INVALID | SUSPICIOUS",
  "confidence": 0-100,
  "issues": ["reason 1", "reason 2"]
}`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            { role: "system", content: systemPrompt },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "Analyze the following CNIC image(s) and return the structured verification JSON. Convert all Urdu to English. Return ONLY raw JSON.",
                    },
                    ...imageContents,
                ],
            },
        ],
        max_tokens: 1500,
        temperature: 0,
    });

    const content = response.choices[0]?.message?.content || "{}";

    // Strip markdown code fences if present
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```\n?$/g, "").trim();
    }

    return JSON.parse(jsonStr);
}

// ─── Fallback: Translate Urdu address to English via GPT-4o ──
async function translateUrduAddress(urduAddress) {
    if (!urduAddress) return null;
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are a Pakistani address translator. Convert Urdu addresses to proper English.
Rules:
- Translate Urdu labels: "مکان نمبر" → "House No.", "گلی نمبر" → "Street No.", "محلہ" → "Mohallah", etc.
- Keep proper nouns transliterated (e.g., city names, area names).
- Format as a single-line English address.
- Return ONLY the translated English address string, nothing else.
- If the input is not a valid address, return null.`,
                },
                {
                    role: "user",
                    content: `Translate this Urdu CNIC address to English:\n\n${urduAddress}`,
                },
            ],
            max_tokens: 300,
            temperature: 0,
        });
        const result = (response.choices[0]?.message?.content || "").trim();
        if (!result || result.toLowerCase() === "null") return null;
        // Verify result contains only English characters
        const hasUrdu = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(result);
        return hasUrdu ? null : result;
    } catch (err) {
        console.error("[OCR] Address translation fallback failed:", err.message);
        return null;
    }
}

// ─── POST /cnic — Full Verification Pipeline ─────────────
router.post(
    "/cnic",
    upload.array("cnicImage", 2),
    optionalToken,
    async (req, res) => {
        const filePaths = [];

        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: "At least one CNIC image file is required" });
            }

            filePaths.push(...req.files.map((f) => f.path));
            const userId = req.body.userId || req.user?.userId;
            const initiatorId = req.body.initiatorId || null;

            console.log(`[OCR] Starting CNIC verification — ${filePaths.length} image(s) — userId: ${userId}`);

            // ── STEP 1: GPT-4o Extraction + Initial Assessment ──
            let gptResult;
            try {
                gptResult = await verifyCNICWithGPT(filePaths);
            } catch (gptErr) {
                console.error("[OCR] GPT-4o first attempt failed:", gptErr.message);
                // Retry once
                gptResult = await verifyCNICWithGPT(filePaths);
            }
            console.log("[OCR] GPT-4o result:", JSON.stringify(gptResult, null, 2));

            // ── STEP 1b: Address translation fallback ──
            if (!gptResult.address && gptResult.address_urdu) {
                console.log("[OCR] Address missing but Urdu available, attempting translation...");
                const translatedAddress = await translateUrduAddress(gptResult.address_urdu);
                if (translatedAddress) {
                    gptResult.address = translatedAddress;
                    console.log("[OCR] Address translated successfully:", translatedAddress);
                } else {
                    console.log("[OCR] Address translation fallback also failed.");
                }
            }

            // ── STEP 2: Server-Side Validation Layer ────────────
            const serverIssues = [...(gptResult.issues || [])];
            let serverStatus = gptResult.status || "SUSPICIOUS";
            let confidence = gptResult.confidence ?? 50;

            const cnic = gptResult.cnic_number;

            if (!cnic) {
                serverStatus = "INVALID";
                serverIssues.push("CNIC number could not be extracted from image");
                confidence = Math.min(confidence, 20);
            } else {
                // Format check
                if (!isValidCNICFormat(cnic)) {
                    // Try auto-clean
                    const cleaned = cnic.replace(/[^0-9-]/g, "");
                    if (isValidCNICFormat(cleaned)) {
                        gptResult.cnic_number = cleaned;
                        serverIssues.push(`CNIC format auto-corrected from '${cnic}' to '${cleaned}'`);
                    } else {
                        serverStatus = "INVALID";
                        serverIssues.push(`CNIC format invalid: '${cnic}' does not match XXXXX-XXXXXXX-X`);
                        confidence = Math.min(confidence, 15);
                    }
                }

                // First digit check
                if (cnic && !isFirstDigitValid(cnic)) {
                    serverStatus = "INVALID";
                    serverIssues.push(`First digit '${cnic[0]}' is not in range 1–7`);
                    confidence = Math.min(confidence, 10);
                }

                // Fake pattern check
                if (cnic && isFakePattern(cnic)) {
                    serverStatus = "INVALID";
                    serverIssues.push("CNIC contains fake/sequential digit pattern");
                    confidence = Math.min(confidence, 5);
                }

                // Location consistency check
                const locCheck = checkLocationConsistency(gptResult.cnic_number, gptResult.address);
                if (!locCheck.consistent) {
                    if (serverStatus === "VALID") serverStatus = "SUSPICIOUS";
                    serverIssues.push(...locCheck.issues);
                    confidence = Math.min(confidence, 60);
                }
            }

            // OCR quality downgrade
            if (gptResult.ocr_quality === "BLURRY") {
                if (serverStatus === "VALID") serverStatus = "SUSPICIOUS";
                serverIssues.push("Image quality is low — OCR confidence reduced");
                confidence = Math.min(confidence, 50);
            } else if (gptResult.ocr_quality === "PARTIAL") {
                if (serverStatus === "VALID") serverStatus = "SUSPICIOUS";
                serverIssues.push("Partial OCR — some fields may be missing or inaccurate");
                confidence = Math.min(confidence, 70);
            }

            // Build final verification result
            const verificationResult = {
                cnic_number: gptResult.cnic_number || null,
                name: gptResult.name || null,
                father_name: gptResult.father_name || null,
                date_of_birth: gptResult.date_of_birth || null,
                date_of_issue: gptResult.date_of_issue || null,
                date_of_expiry: gptResult.date_of_expiry || null,
                gender: gptResult.gender || null,
                address: gptResult.address || null,
                address_urdu: gptResult.address_urdu || null,
                city: gptResult.city || null,
                ocr_quality: gptResult.ocr_quality || "PARTIAL",
                status: serverStatus,
                confidence: confidence,
                issues: serverIssues,
            };

            console.log("[OCR] Final verification result:", JSON.stringify(verificationResult, null, 2));

            // ── STEP 3: Encrypt & Save to Firebase ──────────────
            if (userId) {
                const sensitiveFields = [
                    "cnic_number", "name", "father_name",
                    "date_of_birth", "date_of_issue", "date_of_expiry",
                    "gender", "address", "address_urdu", "city",
                ];

                const encryptedData = encryptFields(verificationResult, sensitiveFields);
                encryptedData.verificationStatus = verificationResult.status;
                encryptedData.confidence = verificationResult.confidence;
                encryptedData.issues = verificationResult.issues;
                encryptedData.ocr_quality = verificationResult.ocr_quality;
                encryptedData.verifiedAt = new Date().toISOString();
                encryptedData.ocrMethod = "gpt-4o-vision";

                await adminDb.ref(`users/${userId}/cnicVerification`).set(encryptedData);

                // Save full verification object + status at top level for admin display
                const topLevelUpdate = {
                    cnicVerificationStatus: {
                        status: verificationResult.status,
                        confidence: verificationResult.confidence,
                        issues: verificationResult.issues || [],
                        name: verificationResult.name || null,
                        cnic_number: verificationResult.cnic_number || null,
                        date_of_birth: verificationResult.date_of_birth || null,
                        ocr_quality: verificationResult.ocr_quality || null,
                        verifiedAt: new Date().toISOString(),
                    },
                    cnicVerifiedAt: new Date().toISOString(),
                };

                if (verificationResult.cnic_number) {
                    topLevelUpdate.cnicNumber = encryptData(verificationResult.cnic_number);
                    topLevelUpdate.cnicNumber_hash = hashData(verificationResult.cnic_number);
                }

                await adminDb.ref(`users/${userId}`).update(topLevelUpdate);

                // If initiatorId provided, save to KYC node
                if (initiatorId && verificationResult.cnic_number) {
                    await adminDb.ref(`users/${userId}/kycByInitiator/${initiatorId}`).update({
                        cnicNumber: encryptData(verificationResult.cnic_number),
                        cnicNumber_hash: hashData(verificationResult.cnic_number),
                        fullName: verificationResult.name ? encryptData(verificationResult.name) : null,
                        cnicVerificationStatus: verificationResult.status,
                        cnicExtractedAt: new Date().toISOString(),
                    });
                }

                await logEvent("DATA_ACCESS", userId, {
                    action: "cnic_verification_gpt4o",
                    status: verificationResult.status,
                    confidence: verificationResult.confidence,
                    cnicDetected: !!verificationResult.cnic_number,
                    issues: verificationResult.issues,
                    ip: req.ip,
                });
            }

            // ── STEP 4: Respond ─────────────────────────────────
            return res.json({
                success: true,
                verification: verificationResult,
                // Backward compatibility fields
                cnicNumber: verificationResult.cnic_number,
                data: {
                    full_name: verificationResult.name,
                    father_name: verificationResult.father_name,
                    cnic_number: verificationResult.cnic_number,
                    date_of_birth: verificationResult.date_of_birth,
                    date_of_issue: verificationResult.date_of_issue,
                    date_of_expiry: verificationResult.date_of_expiry,
                    gender: verificationResult.gender,
                    address: verificationResult.address,
                    address_urdu: verificationResult.address_urdu,
                    city: verificationResult.city,
                },
                message: `CNIC verification complete — Status: ${verificationResult.status}`,
            });

        } catch (err) {
            console.error("[OCR/CNIC] Error:", err);

            if (err.message && err.message.includes("Invalid file type")) {
                return res.status(400).json({ error: err.message });
            }

            await logEvent("REJECTED_CNIC", req.user?.userId, {
                error: err.message,
                ip: req.ip,
            }).catch(() => {});

            return res.status(500).json({ error: "CNIC verification failed: " + err.message });
        } finally {
            // Clean up uploaded files
            for (const fp of filePaths) {
                if (fs.existsSync(fp)) {
                    try { fs.unlinkSync(fp); } catch (e) { console.error("[OCR] Cleanup error:", e); }
                }
            }
        }
    }
);

// ─── PDF multer config (for bank statement) ──────────────
const pdfFileFilter = (req, file, cb) => {
    const allowedMimes = ["application/pdf"];
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (allowedMimes.includes(file.mimetype) || ext === ".pdf") {
        cb(null, true);
    } else {
        cb(new Error(`INVALID_FILE_TYPE: Only PDF files are allowed for bank statements. Received: '${file.mimetype || ext}'`), false);
    }
};

const pdfUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
            cb(null, `bankstmt-${uniqueSuffix}.pdf`);
        },
    }),
    fileFilter: pdfFileFilter,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ─── Name normalization helper ───────────────────────────
function normalizeName(name) {
    if (!name) return "";
    return name
        .toLowerCase()
        .replace(/[^a-z\s]/g, "")   // strip non-alpha chars
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Check if two names match — exact or partial (one contains the other).
 * Returns true when there is a meaningful overlap.
 */
function namesMatch(a, b) {
    const na = normalizeName(a);
    const nb = normalizeName(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    // Allow partial match: either name contains the other (handles middle-name differences)
    if (na.includes(nb) || nb.includes(na)) return true;
    // Word-level intersection: ≥2 words in common
    const wordsA = new Set(na.split(" "));
    const wordsB = nb.split(" ");
    const common = wordsB.filter(w => w.length > 2 && wordsA.has(w));
    return common.length >= 2;
}

// ─── GPT-4o Bank Statement Data Extraction ──────────────
async function extractBankStatementName(pdfPath) {
    // Step 1: Extract text from PDF using pdf-parse
    const pdfParse = require("pdf-parse");
    const pdfBuffer = fs.readFileSync(pdfPath);
    let pdfText = "";
    try {
        const pdfData = await pdfParse(pdfBuffer);
        pdfText = (pdfData.text || "").substring(0, 4000); // Limit to first 4000 chars
        console.log("[OCR/BankStmt] Extracted PDF text length:", pdfText.length);
    } catch (parseErr) {
        console.error("[OCR/BankStmt] PDF text extraction failed:", parseErr.message);
        // Fallback: try sending raw base64 as text hint
        pdfText = "[PDF text extraction failed — raw content unavailable]";
    }

    if (!pdfText || pdfText.length < 20) {
        return { account_holder_name: null, bank_name: null, cnic_number: null, opening_balance: null, confidence: 0 };
    }

    // Step 2: Send extracted text to GPT-4o for structured extraction
    const systemPrompt = `You are a Pakistani bank document specialist.
The user has provided extracted text from a bank statement PDF.

Extract the following fields:
1. Account holder's full name (transliterate Urdu to English if needed)
2. Bank name
3. CNIC number (format: XXXXX-XXXXXXX-X) if present
4. Opening balance (numeric value) if present

Rules:
- Return ONLY raw JSON — no markdown, no extra text.
- If a field is not found, set it to null.
- Transliterate any Urdu/Arabic text to English.

Output format:
{
  "account_holder_name": "Full Name Here or null",
  "bank_name": "Bank name or null",
  "cnic_number": "XXXXX-XXXXXXX-X or null",
  "opening_balance": "number or null",
  "confidence": 0-100
}`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            { role: "system", content: systemPrompt },
            {
                role: "user",
                content: `Extract account holder details from this bank statement text. Return ONLY raw JSON.\n\n--- BANK STATEMENT TEXT ---\n${pdfText}`,
            },
        ],
        max_tokens: 400,
        temperature: 0,
    });

    let content = (response.choices[0]?.message?.content || "{}").trim();
    if (content.startsWith("```")) {
        content = content.replace(/```json?\n?/g, "").replace(/```\n?$/g, "").trim();
    }
    try {
        return JSON.parse(content);
    } catch {
        return { account_holder_name: null, confidence: 0 };
    }
}

// ─── POST /bank-statement — Validate bank statement PDF ──
router.post(
    "/bank-statement",
    pdfUpload.single("bankStatement"),
    optionalToken,
    async (req, res) => {
        const filePath = req.file?.path;

        try {
            // 1. File type guard (multer filter already rejects non-PDFs, but double-check)
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: "No file uploaded",
                    errorCode: "NO_FILE",
                });
            }

            const userId = req.body.userId || req.user?.userId;
            console.log(`[OCR/BankStmt] Processing PDF for userId: ${userId}`);

            // 2. Extract account holder name via GPT-4o
            let extractedResult;
            try {
                extractedResult = await extractBankStatementName(filePath);
            } catch (ocrErr) {
                console.error("[OCR/BankStmt] GPT-4o extraction failed:", ocrErr.message);
                // If GPT-4o cannot process the PDF directly, still allow upload but skip name check
                return res.json({
                    success: true,
                    matched: null,
                    extractedName: null,
                    storedName: null,
                    message: "OCR extraction unavailable — document accepted without name verification",
                    warning: "Name comparison skipped due to OCR limitation",
                });
            }

            const extractedName = extractedResult?.account_holder_name || null;
            console.log(`[OCR/BankStmt] Extracted name: "${extractedName}" (confidence: ${extractedResult?.confidence})`);

            // 3. Load stored CNIC name from Firebase
            let storedName = null;
            if (userId) {
                try {
                    const userSnap = await adminDb.ref(`users/${userId}`).once("value");
                    const userData = userSnap.val();

                    if (userData) {
                        // Try multiple name sources — prefer decrypted CNIC verification name
                        const { decryptData } = require("../utils/encryption");
                        const safeDecrypt = (v) => { try { return v ? decryptData(v) : null; } catch { return v; } };

                        storedName =
                            safeDecrypt(userData?.cnicVerificationStatus?.name) ||
                            safeDecrypt(userData?.fullName) ||
                            userData?.name ||
                            null;
                    }
                } catch (dbErr) {
                    console.warn("[OCR/BankStmt] Could not fetch user profile:", dbErr.message);
                }
            }

            console.log(`[OCR/BankStmt] Stored CNIC name: "${storedName}"`);

            // 4. Name comparison
            if (!extractedName) {
                // Could not read the name — accept document but warn
                return res.json({
                    success: true,
                    matched: null,
                    extractedName: null,
                    storedName,
                    message: "Could not extract account holder name from document",
                    warning: "Name verification skipped — please ensure document is readable",
                });
            }

            const matched = storedName ? namesMatch(extractedName, storedName) : null;

            // 5. Log event
            if (userId) {
                await logEvent("BANK_STATEMENT_OCR", userId, {
                    matched,
                    extractedName,
                    storedName,
                    confidence: extractedResult?.confidence,
                    ip: req.ip,
                }).catch(() => {});
            }

            // 6. Return result
            return res.json({
                success: true,
                matched,
                extractedName,
                storedName,
                bankName: extractedResult?.bank_name || null,
                confidence: extractedResult?.confidence || 0,
                message: matched === true
                    ? "Name verification passed — document accepted"
                    : matched === false
                    ? "Name mismatch — document rejected"
                    : "Name comparison inconclusive",
            });

        } catch (err) {
            console.error("[OCR/BankStmt] Error:", err);

            // Multer invalid file type error
            if (err.message && err.message.startsWith("INVALID_FILE_TYPE")) {
                return res.status(400).json({
                    success: false,
                    error: "Only PDF files are accepted for bank statements. Please upload a valid PDF.",
                    errorCode: "INVALID_FILE_TYPE",
                });
            }

            return res.status(500).json({
                success: false,
                error: "Bank statement verification failed: " + err.message,
                errorCode: "INTERNAL_ERROR",
            });
        } finally {
            if (filePath && fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch {}
            }
        }
    }
);

// ─── Multer error handler ───────────────────────────────
router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ error: "File too large. Maximum size is 20MB." });
        }
        return res.status(400).json({ error: err.message });
    }
    // PDF type rejection from fileFilter
    if (err.message && err.message.startsWith("INVALID_FILE_TYPE")) {
        return res.status(400).json({
            success: false,
            error: "Only PDF files are accepted for bank statements.",
            errorCode: "INVALID_FILE_TYPE",
        });
    }
    next(err);
});

module.exports = router;
