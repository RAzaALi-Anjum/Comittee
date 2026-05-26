"""
app.py — FastAPI Server for Committee Feedback & Recommendation
═══════════════════════════════════════════════════════════════════
Production ML API server that auto-initializes on startup:
  - Loads trained model (model.pkl + vectorizer.pkl)
  - Trains from CSV if model files are missing
  - Exposes REST endpoints for feedback, recommendations, and retraining

Run:
    uvicorn app:app --host 0.0.0.0 --port 8000 --reload

Endpoints:
    POST /feedback              — Submit feedback → save + ML score
    GET  /recommendations       — Ranked committees by ML score
    POST /recommend-initiators  — Ranked initiators (frontend compat)
    POST /retrain               — Retrain model from latest CSV
    GET  /health                — Health check
"""

import os
import csv
import threading
from datetime import datetime
from contextlib import asynccontextmanager

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

# ── Local imports ───────────────────────────────────────────────────────
from recommendation import (
    load_model,
    get_sentiment_score,
    get_sentiment_label,
    rank_committees,
    rank_initiators,
    rank_initiators_v2,
)

# ── Paths ───────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "data", "feedback.csv")
MODEL_PATH = os.path.join(BASE_DIR, "model.pkl")
VECTORIZER_PATH = os.path.join(BASE_DIR, "vectorizer.pkl")

# Thread lock for CSV writes
_csv_lock = threading.Lock()


# ═══════════════════════════════════════════════════════════════════════
# STARTUP — Auto-initialize ML model
# ═══════════════════════════════════════════════════════════════════════
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Auto-initialize ML model on server startup."""
    print("\n" + "=" * 60)
    print("  ML Recommendation Server -- Initializing")
    print("=" * 60)

    # Ensure data directory exists
    os.makedirs(os.path.join(BASE_DIR, "data"), exist_ok=True)

    # Train model if pkl files are missing
    if not os.path.exists(MODEL_PATH) or not os.path.exists(VECTORIZER_PATH):
        print("[Startup] Model files not found -- training now...")
        try:
            from train_model import train
            train()
        except Exception as e:
            print(f"[Startup] WARNING: Training failed: {e}")
            print("[Startup] Server will use keyword fallback for sentiment")

    # Load model into memory
    success = load_model()
    if success:
        print("[Startup] [OK] ML model loaded and ready")
    else:
        print("[Startup] [WARN] Using keyword fallback (no model loaded)")

    # Load initial stats
    if os.path.exists(CSV_PATH):
        df = pd.read_csv(CSV_PATH)
        print(f"[Startup] Loaded {len(df)} feedback records from CSV")
    else:
        print("[Startup] No existing feedback data found")

    print(f"[Startup] Server ready at http://0.0.0.0:8000")
    print("=" * 60 + "\n")

    yield  # Server is running

    print("\n[Shutdown] ML server shutting down")


# ═══════════════════════════════════════════════════════════════════════
# FASTAPI APP
# ═══════════════════════════════════════════════════════════════════════
app = FastAPI(
    title="Committee ML Recommendation API",
    description="ML-powered feedback analysis and committee ranking system",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — allow React Native and browser access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════════
class FeedbackRequest(BaseModel):
    user_id: str
    committee_id: str
    item_id: str = ""
    feedback_text: str
    rating: float = Field(..., ge=1, le=5)

class InitiatorRecommendRequest(BaseModel):
    userId: str = "current"
    minRating: float = 0.0
    minSuccessful: int = 0

class InitiatorRecommendV2Request(BaseModel):
    """
    V2 request: caller passes live initiator data from Firebase.
    The ML server applies rank_initiators_v2 scoring and returns ranked list.
    """
    initiators: list = []           # list of {initiatorId, name, avgRating, completedCommittees, ...}
    ratings_data: dict = {}         # {initiatorId: [list of rating numbers]}
    completed_data: dict = {}       # {initiatorId: count}


# ═══════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════

# ─── Health Check ────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    """Health check with system status."""
    model_loaded = os.path.exists(MODEL_PATH) and os.path.exists(VECTORIZER_PATH)
    feedback_count = 0
    if os.path.exists(CSV_PATH):
        try:
            df = pd.read_csv(CSV_PATH)
            feedback_count = len(df)
        except Exception:
            pass

    return {
        "status": "ok",
        "model_loaded": model_loaded,
        "feedback_count": feedback_count,
        "timestamp": datetime.now().isoformat(),
        "version": "2.0.0",
        "scoring": {
            "rating_weight": 0.40,
            "sentiment_weight": 0.60,
            "model": "TF-IDF + LogisticRegression",
        },
    }


# ─── POST /feedback — Submit + Save + ML Score ──────────────────────
@app.post("/feedback")
async def submit_feedback(req: FeedbackRequest):
    """
    Accept client feedback, save to CSV, and return ML sentiment analysis.
    Automatically updates recommendation rankings.
    """
    # 1. Run ML sentiment analysis
    sentiment_score = get_sentiment_score(req.feedback_text)
    sentiment_label = get_sentiment_label(req.feedback_text)

    # 2. Save to CSV
    try:
        file_exists = os.path.exists(CSV_PATH)
        with _csv_lock:
            with open(CSV_PATH, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                if not file_exists:
                    writer.writerow(["user_id", "committee_id", "item_id", "feedback_text", "rating"])
                writer.writerow([
                    req.user_id,
                    req.committee_id,
                    req.item_id or req.committee_id,
                    req.feedback_text,
                    req.rating,
                ])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save feedback: {str(e)}")

    # 3. Calculate composite score for this feedback
    rating_normalized = req.rating / 5.0
    composite_score = (rating_normalized * 0.40) + (sentiment_score * 0.60)

    return {
        "success": True,
        "message": "Feedback saved and analyzed",
        "analysis": {
            "sentiment_score": round(sentiment_score, 4),
            "sentiment_label": sentiment_label,
            "rating": req.rating,
            "rating_normalized": round(rating_normalized, 4),
            "composite_score": round(composite_score, 4),
            "rating_stars": round(composite_score * 5, 1),
        },
        "feedback": {
            "user_id": req.user_id,
            "committee_id": req.committee_id,
            "item_id": req.item_id or req.committee_id,
        },
    }


# ─── GET /recommendations — Ranked Committees ───────────────────────
@app.get("/recommendations")
async def get_recommendations(limit: int = 20):
    """
    Return committees ranked by composite ML score.
    Score = (rating × 0.40) + (ML sentiment × 0.60)
    """
    try:
        rankings = rank_committees()
        if limit:
            rankings = rankings[:limit]

        return {
            "success": True,
            "count": len(rankings),
            "scoring": {
                "formula": "final_score = (rating_normalized × 0.40) + (sentiment_score × 0.60)",
                "model": "TF-IDF + LogisticRegression",
            },
            "recommendations": rankings,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recommendation failed: {str(e)}")


# ─── POST /recommend-initiators — Frontend Compatible ────────────────
@app.post("/recommend-initiators")
async def recommend_initiators(req: InitiatorRecommendRequest):
    """
    Return ranked initiators for the frontend RecommendationScreen.
    Compatible with the existing React Native component.
    """
    try:
        rankings = rank_initiators()

        # Apply filters
        if req.minRating > 0:
            rankings = [r for r in rankings if r["avg_rating"] >= req.minRating]

        return {
            "success": True,
            "count": len(rankings),
            "recommendations": rankings,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recommendation failed: {str(e)}")



# ─── POST /recommend-initiators-v2 — Rating + Completed Ranking ──────
@app.post("/recommend-initiators-v2")
async def recommend_initiators_v2(req: InitiatorRecommendV2Request):
    """
    V2 ranked initiator recommendations.
    Score = (avg_rating/5 × 0.60) + (completedCommittees/20 × 0.40)

    Accepts live Firebase data via request body so the ML server
    doesn't need direct database access.
    Returns initiators sorted by score with rank labels.
    """
    try:
        ranked = rank_initiators_v2(
            initiators_data=req.initiators,
            ratings_data=req.ratings_data or {},
            completed_data=req.completed_data or {},
        )

        return {
            "success": True,
            "count": len(ranked),
            "scoringFormula": "score = (avgRating/5 × 0.60) + (completedCommittees/20 × 0.40)",
            "weights": {"rating": 0.60, "completed": 0.40},
            "recommendations": ranked,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"V2 recommendation failed: {str(e)}")


# ─── POST /retrain — Retrain Model from Latest Data ─────────────────
@app.post("/retrain")
async def retrain_model():
    """Retrain the ML model using the latest feedback.csv data."""
    try:
        from train_model import train
        model, vectorizer = train()

        # Reload into recommendation engine
        load_model()

        feedback_count = 0
        if os.path.exists(CSV_PATH):
            df = pd.read_csv(CSV_PATH)
            feedback_count = len(df)

        return {
            "success": True,
            "message": "Model retrained successfully",
            "feedback_count": feedback_count,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Retraining failed: {str(e)}")


# ─── POST /analyze — Analyze text sentiment only ────────────────────
@app.post("/analyze")
async def analyze_sentiment(data: dict):
    """Analyze sentiment of a text without saving."""
    text = data.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="text field is required")

    score = get_sentiment_score(text)
    label = get_sentiment_label(text)

    return {
        "success": True,
        "text": text,
        "sentiment_score": round(score, 4),
        "sentiment_label": label,
    }


# ═══════════════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
