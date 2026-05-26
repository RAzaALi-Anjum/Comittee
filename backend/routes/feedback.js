// ============================================================
// Feedback & NLP Recommendation Routes
// FR-59 (NLP sentiment), FR-60 (recommend), FR-85,86,87 (rating)
// UPGRADED: ML forwarding to FastAPI recommendation server
// ============================================================
const express = require("express");
const { encryptData, decryptData, hashData } = require("../utils/encryption");
const { adminDb } = require("../utils/firebaseAdmin");
const { verifyToken } = require("../middleware/auth");
const { logEvent } = require("../utils/auditLogger");
const router = express.Router();

// ─── ML Service Integration ─────────────────────────────
const ML_API_BASE = process.env.ML_API_BASE || "http://127.0.0.1:8000";

async function mlPost(path, body) {
    try {
        const resp = await fetch(`${ML_API_BASE}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) return null;
        return await resp.json();
    } catch (e) {
        console.warn(`[Feedback] ML service (${path}) unreachable:`, e.message);
        return null;
    }
}

async function mlGet(path) {
    try {
        const resp = await fetch(`${ML_API_BASE}${path}`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) return null;
        return await resp.json();
    } catch (e) {
        console.warn(`[Feedback] ML service (${path}) unreachable:`, e.message);
        return null;
    }
}

// FR-59: Zero-dependency keyword NLP
const POSITIVE_KEYWORDS = [
    "great", "excellent", "good", "trusted", "reliable", "honest",
    "professional", "satisfied", "happy", "recommend", "best", "amazing",
    "wonderful", "fantastic", "outstanding", "punctual", "transparent",
];
const NEGATIVE_KEYWORDS = [
    "bad", "fraud", "cheat", "scam", "late", "delayed", "unprofessional",
    "unreliable", "dishonest", "poor", "worst", "terrible", "horrible",
    "disappointed", "rude", "missing", "stolen", "fake",
];

function analyzeSentiment(text) {
    if (!text) return "neutral";
    const lower = text.toLowerCase();
    const posCount = POSITIVE_KEYWORDS.filter(k => lower.includes(k)).length;
    const negCount = NEGATIVE_KEYWORDS.filter(k => lower.includes(k)).length;
    if (negCount > posCount) return "negative";
    if (posCount > negCount) return "positive";
    return "neutral";
}

function safeDecrypt(val) { try { return val ? decryptData(val) : val; } catch { return val; } }

// ─── FR-85/86/87: Submit Feedback & Rating ──────────────
// POST /api/feedback/submit
router.post("/submit", verifyToken, async (req, res) => {
    try {
        const { initiatorId, committeeId, rating, comment } = req.body;
        const userId = req.user.userId;

        if (!initiatorId || !committeeId || !rating)
            return res.status(400).json({ error: "initiatorId, committeeId, and rating required" });
        if (rating < 1 || rating > 5)
            return res.status(400).json({ error: "Rating must be 1–5" });

        // FR-87: Check duplicate rating
        const existingSnap = await adminDb.ref("feedback")
            .orderByChild("committeeId_userId")
            .equalTo(`${committeeId}_${userId}`)
            .once("value");
        if (existingSnap.val())
            return res.status(409).json({ error: "You have already rated this committee (FR-87)" });

        // FR-59: Analyze sentiment — ML first, keyword fallback
        let sentiment = analyzeSentiment(comment || "");
        let mlSentimentScore = null;
        let mlSentimentLabel = null;

        // Forward to ML service for real sentiment scoring
        const mlResult = await mlPost("/feedback", {
            user_id: userId,
            committee_id: committeeId,
            item_id: initiatorId,
            feedback_text: comment || "",
            rating: Number(rating),
        });

        if (mlResult?.success && mlResult.analysis) {
            mlSentimentScore = mlResult.analysis.sentiment_score;
            mlSentimentLabel = mlResult.analysis.sentiment_label;
            sentiment = mlSentimentLabel || sentiment;
            console.log(`[Feedback] ML sentiment: ${mlSentimentLabel} (${mlSentimentScore})`);
        }

        const now = new Date().toISOString();
        const feedbackData = {
            userId,
            initiatorId,
            committeeId,
            committeeId_userId: `${committeeId}_${userId}`,
            rating: Number(rating),
            comment: comment ? encryptData(comment) : null,
            sentiment,
            mlSentimentScore: mlSentimentScore,
            createdAt: now,
        };

        const fbRef = await adminDb.ref("feedback").push(feedbackData);

        // Update initiator's aggregate rating
        const allFbSnap = await adminDb.ref("feedback")
            .orderByChild("initiatorId")
            .equalTo(initiatorId)
            .once("value");
        const allFb = allFbSnap.val() || {};
        const allRatings = Object.values(allFb).map(f => f.rating).filter(Boolean);
        const avgRating = allRatings.reduce((a, b) => a + b, 0) / allRatings.length;
        const totalFeedback = allRatings.length;

        await adminDb.ref(`users/${initiatorId}`).update({
            averageRating: Math.round(avgRating * 10) / 10,
            totalFeedback,
            lastRatedAt: now,
        });

        await logEvent("FEEDBACK_SUBMITTED", userId, { initiatorId, committeeId, rating, sentiment, mlSentimentScore, ip: req.ip });
        return res.json({
            success: true,
            feedbackId: fbRef.key,
            sentiment,
            mlSentimentScore,
            averageRating: Math.round(avgRating * 10) / 10,
        });
    } catch (err) {
        console.error("[Feedback/Submit]", err);
        return res.status(500).json({ error: "Failed to submit feedback" });
    }
});

// ─── FR-59: Analyze Sentiment of a text ─────────────────
// POST /api/feedback/analyze
router.post("/analyze", verifyToken, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: "text required" });
        const sentiment = analyzeSentiment(text);
        const posMatches = POSITIVE_KEYWORDS.filter(k => text.toLowerCase().includes(k));
        const negMatches = NEGATIVE_KEYWORDS.filter(k => text.toLowerCase().includes(k));
        return res.json({ success: true, sentiment, positiveKeywords: posMatches, negativeKeywords: negMatches });
    } catch (err) {
        console.error("[Feedback/Analyze]", err);
        return res.status(500).json({ error: "Analysis failed" });
    }
});

// ─── FR-58/60: Get Recommendations (ML-powered + Firebase fallback) ──
// GET /api/feedback/recommend?limit=10
router.get("/recommend", verifyToken, async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 10, 50);

        // Try ML service first for ML-ranked recommendations
        const mlRecs = await mlGet(`/recommendations?limit=${limit}`);
        if (mlRecs?.success && mlRecs.recommendations?.length > 0) {
            console.log(`[Feedback] Serving ${mlRecs.recommendations.length} ML-ranked recommendations`);
        }

        // Always get Firebase user data for enrichment
        const usersSnap = await adminDb.ref("users").orderByChild("role").equalTo("initiator").once("value");
        const users = usersSnap.val() || {};

        // Get all feedback for sentiment scoring
        const fbSnap = await adminDb.ref("feedback").once("value");
        const allFb = fbSnap.val() || {};

        // Aggregate sentiment per initiator (with ML scores if available)
        const sentimentScores = {};
        Object.values(allFb).forEach(fb => {
            if (!sentimentScores[fb.initiatorId]) sentimentScores[fb.initiatorId] = { pos: 0, neg: 0, neutral: 0, mlTotal: 0, mlCount: 0 };
            const bucket = fb.sentiment === "positive" ? "pos" : fb.sentiment === "negative" ? "neg" : "neutral";
            sentimentScores[fb.initiatorId][bucket]++;
            if (fb.mlSentimentScore != null) {
                sentimentScores[fb.initiatorId].mlTotal += fb.mlSentimentScore;
                sentimentScores[fb.initiatorId].mlCount++;
            }
        });

        const initiators = Object.entries(users)
            .filter(([, u]) => u.initiatorStatus === "approved")
            .map(([id, u]) => {
                const level = u.initiatorLevel || 1;
                const rating = u.averageRating || 0;
                const scores = sentimentScores[id] || { pos: 0, neg: 0, neutral: 0, mlTotal: 0, mlCount: 0 };

                // Use ML average score if available, else keyword-based
                let mlScore = null;
                if (scores.mlCount > 0) {
                    mlScore = scores.mlTotal / scores.mlCount;
                }
                const sentimentScore = scores.pos - scores.neg;

                // Composite: 40% rating + 60% ML sentiment (or keyword fallback)
                const ratingNorm = rating / 5.0;
                const sentimentNorm = mlScore != null ? mlScore : (sentimentScore > 0 ? 0.7 : sentimentScore < 0 ? 0.3 : 0.5);
                const compositeScore = (ratingNorm * 0.40) + (sentimentNorm * 0.60);

                return {
                    id,
                    name: safeDecrypt(u.fullName) || u.fullName || "Unknown",
                    level,
                    rating,
                    totalFeedback: u.totalFeedback || 0,
                    sentimentScore,
                    mlSentimentScore: mlScore,
                    compositeScore: Math.round(compositeScore * 1000) / 1000,
                    profilePicture: u.profilePicture || null,
                    initiatorStatus: u.initiatorStatus,
                };
            })
            .sort((a, b) => b.compositeScore - a.compositeScore)
            .slice(0, limit);

        return res.json({
            success: true,
            count: initiators.length,
            mlPowered: mlRecs?.success || false,
            scoringFormula: "composite = (rating × 0.40) + (ML_sentiment × 0.60)",
            initiators,
        });
    } catch (err) {
        console.error("[Feedback/Recommend]", err);
        return res.status(500).json({ error: "Recommendation failed" });
    }
});

// ─── Get all feedback for an initiator ──────────────────
// GET /api/feedback/initiator/:initiatorId
router.get("/initiator/:initiatorId", verifyToken, async (req, res) => {
    try {
        const { initiatorId } = req.params;
        const snap = await adminDb.ref("feedback")
            .orderByChild("initiatorId").equalTo(initiatorId).once("value");
        const all = snap.val() || {};
        const feedbacks = Object.entries(all).map(([id, f]) => ({
            id, ...f, comment: safeDecrypt(f.comment),
        }));
        return res.json({ success: true, feedbacks });
    } catch (err) {
        console.error("[Feedback/Initiator]", err);
        return res.status(500).json({ error: "Failed to fetch feedback" });
    }
});

// ─── POST /rate-committee — Committee Completion Rating ──
// Called when a committee is marked "completed" and members rate it
// POST /api/feedback/rate-committee
router.post("/rate-committee", verifyToken, async (req, res) => {
    try {
        const { committeeId, initiatorId, rating, comment } = req.body;
        const userId = req.user.userId;

        if (!committeeId || !initiatorId || !rating)
            return res.status(400).json({ error: "committeeId, initiatorId, and rating required" });
        if (rating < 1 || rating > 5)
            return res.status(400).json({ error: "Rating must be between 1 and 5" });

        // Prevent duplicate rating for same committee by same user
        const dupSnap = await adminDb.ref("committeeRatings")
            .orderByChild("committeeId_userId")
            .equalTo(`${committeeId}_${userId}`)
            .once("value");
        if (dupSnap.val())
            return res.status(409).json({ error: "You have already rated this committee" });

        // Forward to ML service for sentiment analysis
        let mlSentimentScore = null;
        let mlSentimentLabel = null;
        const mlResult = await mlPost("/feedback", {
            user_id: userId,
            committee_id: committeeId,
            item_id: initiatorId,
            feedback_text: comment || `Rating: ${rating} stars`,
            rating: Number(rating),
        });
        if (mlResult?.success && mlResult.analysis) {
            mlSentimentScore = mlResult.analysis.sentiment_score;
            mlSentimentLabel = mlResult.analysis.sentiment_label;
        }

        const now = new Date().toISOString();
        const ratingData = {
            userId,
            committeeId,
            initiatorId,
            committeeId_userId: `${committeeId}_${userId}`,
            rating: Number(rating),
            comment: comment ? encryptData(comment) : null,
            sentiment: mlSentimentLabel || analyzeSentiment(comment || ""),
            mlSentimentScore,
            createdAt: now,
        };

        await adminDb.ref("committeeRatings").push(ratingData);

        // Recalculate initiator aggregate from all committee ratings
        const allRatingsSnap = await adminDb.ref("committeeRatings")
            .orderByChild("initiatorId")
            .equalTo(initiatorId)
            .once("value");
        const allRatings = Object.values(allRatingsSnap.val() || {})
            .map(r => r.rating).filter(Boolean);
        const avgRating = allRatings.reduce((a, b) => a + b, 0) / (allRatings.length || 1);

        // Count completed committees by this initiator
        const committeeSnap = await adminDb.ref("committees")
            .orderByChild("createdBy")
            .equalTo(initiatorId)
            .once("value");
        const allCommittees = Object.values(committeeSnap.val() || {});
        const completedCount = allCommittees.filter(c => {
            const s = String(c.status || "").toLowerCase();
            return s === "completed" || s === "finished" || s === "done";
        }).length;

        await adminDb.ref(`users/${initiatorId}`).update({
            averageRating: Math.round(avgRating * 10) / 10,
            totalCommitteeRatings: allRatings.length,
            completedCommittees: completedCount,
            lastRatedAt: now,
        });

        await logEvent("COMMITTEE_RATING_SUBMITTED", userId, {
            initiatorId, committeeId, rating, ip: req.ip,
        });

        return res.json({
            success: true,
            averageRating: Math.round(avgRating * 10) / 10,
            totalRatings: allRatings.length,
            completedCommittees: completedCount,
        });
    } catch (err) {
        console.error("[Feedback/RateCommittee]", err);
        return res.status(500).json({ error: "Failed to submit committee rating" });
    }
});

// ─── GET /recommend-ranked — Ranked Initiators with Scores ──
// GET /api/feedback/recommend-ranked
// Score = (avg_rating × 0.60) + (completedCommittees × weight2)
router.get("/recommend-ranked", verifyToken, async (req, res) => {
    try {
        const WEIGHT_RATING = 0.60;
        const WEIGHT_COMPLETED = 0.40;
        const MAX_COMPLETED = 20; // normalize: treat 20+ as "max"

        // Fetch all approved initiators
        const usersSnap = await adminDb.ref("users")
            .orderByChild("initiatorStatus")
            .equalTo("approved")
            .once("value");
        const users = usersSnap.val() || {};

        // Fetch all committee ratings
        const ratingsSnap = await adminDb.ref("committeeRatings").once("value");
        const allRatings = ratingsSnap.val() || {};

        // Fetch all committees to count completions
        const committeesSnap = await adminDb.ref("committees").once("value");
        const allCommittees = Object.values(committeesSnap.val() || {});

        // Aggregate ratings per initiator
        const ratingsByInitiator = {};
        Object.values(allRatings).forEach(r => {
            if (!ratingsByInitiator[r.initiatorId]) ratingsByInitiator[r.initiatorId] = [];
            ratingsByInitiator[r.initiatorId].push(r.rating);
        });

        // Count completed committees per initiator
        const completedByInitiator = {};
        allCommittees.forEach(c => {
            const s = String(c.status || "").toLowerCase();
            const isCompleted = s === "completed" || s === "finished" || s === "done";
            if (isCompleted && c.createdBy) {
                completedByInitiator[c.createdBy] = (completedByInitiator[c.createdBy] || 0) + 1;
            }
        });

        const { decryptData } = require("../utils/encryption");
        const safeDecryptLocal = (v) => { try { return v ? decryptData(v) : null; } catch { return v; } };

        const ranked = Object.entries(users).map(([id, u]) => {
            const ratings = ratingsByInitiator[id] || [];
            const avgRating = ratings.length > 0
                ? ratings.reduce((a, b) => a + b, 0) / ratings.length
                : (u.averageRating || 0);
            const completed = completedByInitiator[id] || u.completedCommittees || 0;

            // Normalize: rating /5 and completed / MAX_COMPLETED, both capped at 1
            const ratingNorm = Math.min(avgRating / 5, 1);
            const completedNorm = Math.min(completed / MAX_COMPLETED, 1);

            const score = (ratingNorm * WEIGHT_RATING) + (completedNorm * WEIGHT_COMPLETED);

            return {
                id,
                initiatorId: id,
                name: safeDecryptLocal(u.fullName) || u.fullName || u.name || "Unknown Initiator",
                profilePicture: u.profilePicture || null,
                avgRating: Math.round(avgRating * 10) / 10,
                totalRatings: ratings.length || u.totalCommitteeRatings || 0,
                completedCommittees: completed,
                score: Math.round(score * 1000) / 1000,
                level: u.initiatorLevel || 1,
            };
        })
        .sort((a, b) => b.score - a.score)
        .map((item, index) => ({
            ...item,
            rank: index + 1,
            rankLabel: index === 0 ? "#1 Top Initiator" : index === 1 ? "#2 Second" : index === 2 ? "#3 Third" : `#${index + 1}`,
        }));

        return res.json({
            success: true,
            count: ranked.length,
            scoringFormula: "score = (avgRating/5 × 0.60) + (completedCommittees/20 × 0.40)",
            weights: { rating: WEIGHT_RATING, completed: WEIGHT_COMPLETED },
            initiators: ranked,
        });
    } catch (err) {
        console.error("[Feedback/RecommendRanked]", err);
        return res.status(500).json({ error: "Ranking failed" });
    }
});

// ─── GET /committee-ratings/:committeeId — Get ratings for a committee ──
router.get("/committee-ratings/:committeeId", verifyToken, async (req, res) => {
    try {
        const { committeeId } = req.params;
        const snap = await adminDb.ref("committeeRatings")
            .orderByChild("committeeId")
            .equalTo(committeeId)
            .once("value");
        const all = snap.val() || {};
        const ratings = Object.entries(all).map(([id, r]) => ({
            id, ...r, comment: safeDecrypt(r.comment),
        }));
        const avg = ratings.length
            ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length
            : 0;
        return res.json({
            success: true,
            committeeId,
            ratings,
            averageRating: Math.round(avg * 10) / 10,
            totalRatings: ratings.length,
        });
    } catch (err) {
        console.error("[Feedback/CommitteeRatings]", err);
        return res.status(500).json({ error: "Failed to fetch ratings" });
    }
});

module.exports = router;

