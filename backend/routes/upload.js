// ============================================================
// File Upload Route — Local Server Storage
// Stores files on the backend server, serves via HTTP URL
// No Firebase Storage required
// ============================================================
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// ── Persistent uploads directory ────────────────────────────
const uploadsDir = path.join(__dirname, "..", "uploads", "files");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Multer: save directly to persistent folder ──────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        let ext = path.extname(file.originalname || "").toLowerCase();
        // Sanitize extension to ensure it is alphanumeric (with dot) and valid, avoiding illegal characters on Windows
        if (!/^\.[a-z0-9]+$/.test(ext) || ext.length > 6) {
            ext = ".jpg";
        }
        const userId = String(req.body?.userId || req.query?.userId || "u")
            .replace(/[^a-zA-Z0-9]/g, "")
            .slice(0, 12);
        cb(null, `${userId}-${Date.now()}${ext}`);
    },
});

const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        "image/jpeg", "image/jpg", "image/png", "image/bmp",
        "image/tiff", "image/heic", "image/heif",
        "application/octet-stream",
        "application/pdf",
    ];
    const allowedExts = [".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".heic", ".heif", ".pdf"];
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type: ${file.mimetype}`), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ── Helper: get the backend's base URL from request ─────────
function getServerBaseUrl(req) {
    // Use x-forwarded-host if behind proxy, otherwise use req.headers.host
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers.host || "localhost:5000";
    return `${protocol}://${host}`;
}

// ── POST /api/upload/file ────────────────────────────────────
router.post("/file", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: "No file provided" });
        }

        // Build a publicly accessible URL to this file
        const baseUrl = getServerBaseUrl(req);
        const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

        console.log(`[Upload] Saved file: ${req.file.filename} → ${fileUrl}`);

        return res.json({
            success: true,
            url: fileUrl,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype,
        });
    } catch (err) {
        console.error("[Upload] Error:", err.message);
        return res.status(500).json({
            success: false,
            error: "File upload failed: " + err.message,
        });
    }
});

// ── GET /api/upload/list (optional — admin use) ──────────────
router.get("/list", (req, res) => {
    try {
        const files = fs.readdirSync(uploadsDir).map(f => ({
            filename: f,
            size: fs.statSync(path.join(uploadsDir, f)).size,
        }));
        res.json({ success: true, count: files.length, files });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
