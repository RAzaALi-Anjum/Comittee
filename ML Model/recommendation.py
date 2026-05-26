"""
recommendation.py — ML Recommendation & Ranking Engine
═══════════════════════════════════════════════════════════════
Provides sentiment scoring and committee/initiator ranking
using the trained TF-IDF + LogisticRegression model.

Scoring Formulas:
    committee_score = (rating_normalized × 0.40) + (sentiment_score × 0.60)
    initiator_score = (avg_rating/5 × 0.60) + (completed/MAX_COMPLETED × 0.40)
"""

import os
import pandas as pd
import numpy as np
import joblib

# ── Paths ───────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model.pkl")
VECTORIZER_PATH = os.path.join(BASE_DIR, "vectorizer.pkl")
CSV_PATH = os.path.join(BASE_DIR, "data", "feedback.csv")

# ── Ranking weights ─────────────────────────────────────────────────────
WEIGHT_RATING    = 0.60   # weight for avg rating (normalized to 0-1)
WEIGHT_COMPLETED = 0.40   # weight for completed committees count (normalized)
MAX_COMPLETED    = 20     # treat 20+ completed committees as "perfect score"

# ── Module-level model cache ────────────────────────────────────────────
_model = None
_vectorizer = None


def load_model():
    """Load the trained model and vectorizer into memory."""
    global _model, _vectorizer
    if os.path.exists(MODEL_PATH) and os.path.exists(VECTORIZER_PATH):
        _model = joblib.load(MODEL_PATH)
        _vectorizer = joblib.load(VECTORIZER_PATH)
        print("[Recommendation] Model and vectorizer loaded successfully")
        return True
    else:
        print("[Recommendation] WARNING: model.pkl or vectorizer.pkl not found")
        return False


def get_sentiment_score(text: str) -> float:
    """
    Get ML sentiment probability score for a feedback text.

    Returns:
        float: Score between 0.0 (very negative) and 1.0 (very positive)
    """
    global _model, _vectorizer

    if _model is None or _vectorizer is None:
        if not load_model():
            # Fallback: simple keyword-based score
            return _keyword_fallback(text)

    try:
        vec = _vectorizer.transform([text])
        proba = _model.predict_proba(vec)[0]
        # Index 1 = probability of positive class
        positive_idx = list(_model.classes_).index(1) if 1 in _model.classes_ else -1
        if positive_idx >= 0:
            return float(proba[positive_idx])
        return float(proba[-1])
    except Exception as e:
        print(f"[Recommendation] Sentiment scoring error: {e}")
        return _keyword_fallback(text)


def get_sentiment_label(text: str) -> str:
    """Get sentiment label: positive, negative, or neutral."""
    score = get_sentiment_score(text)
    if score >= 0.6:
        return "positive"
    elif score <= 0.4:
        return "negative"
    return "neutral"


def _keyword_fallback(text: str) -> float:
    """Fallback keyword-based sentiment when ML model is unavailable."""
    if not text:
        return 0.5

    positive = [
        "excellent", "great", "good", "amazing", "wonderful", "fantastic",
        "outstanding", "professional", "satisfied", "happy", "recommend",
        "best", "trusted", "reliable", "honest", "brilliant", "perfect",
    ]
    negative = [
        "bad", "terrible", "worst", "horrible", "poor", "fraud", "scam",
        "cheat", "fake", "dishonest", "disappointed", "rude", "unprofessional",
        "unreliable", "delayed", "missing", "stolen", "disaster",
    ]

    lower = text.lower()
    pos_count = sum(1 for w in positive if w in lower)
    neg_count = sum(1 for w in negative if w in lower)

    total = pos_count + neg_count
    if total == 0:
        return 0.5
    return pos_count / total


def rank_committees(df: pd.DataFrame = None) -> list:
    """
    Rank committees by composite ML score.

    Formula: final_score = (rating_norm × 0.40) + (sentiment × 0.60)

    Returns:
        list of dicts sorted by final_score descending
    """
    if df is None:
        if not os.path.exists(CSV_PATH):
            return []
        df = pd.read_csv(CSV_PATH)

    # Normalize column names
    if "feedback" in df.columns and "feedback_text" not in df.columns:
        df = df.rename(columns={"feedback": "feedback_text"})

    if df.empty or "feedback_text" not in df.columns:
        return []

    # Compute sentiment score for each row
    df = df.copy()
    df["sentiment_score"] = df["feedback_text"].apply(get_sentiment_score)
    df["rating"] = pd.to_numeric(df["rating"], errors="coerce").fillna(3.0)

    # Group by committee_id (or item_id)
    group_col = "committee_id" if "committee_id" in df.columns else "item_id"

    grouped = df.groupby(group_col).agg(
        avg_rating=("rating", "mean"),
        avg_sentiment=("sentiment_score", "mean"),
        total_feedback=("rating", "count"),
        positive_count=("sentiment_score", lambda x: (x >= 0.6).sum()),
        negative_count=("sentiment_score", lambda x: (x <= 0.4).sum()),
    ).reset_index()

    # Composite score: 40% rating + 60% sentiment
    grouped["rating_normalized"] = grouped["avg_rating"] / 5.0
    grouped["final_score"] = (
        grouped["rating_normalized"] * 0.40 +
        grouped["avg_sentiment"] * 0.60
    )

    # Sort descending
    grouped = grouped.sort_values("final_score", ascending=False)

    # Build result
    results = []
    for rank, (_, row) in enumerate(grouped.iterrows(), 1):
        results.append({
            "rank": rank,
            "committee_id": row[group_col],
            "final_score": round(float(row["final_score"]), 4),
            "avg_rating": round(float(row["avg_rating"]), 2),
            "sentiment_score": round(float(row["avg_sentiment"]), 4),
            "total_feedback": int(row["total_feedback"]),
            "positive_count": int(row["positive_count"]),
            "negative_count": int(row["negative_count"]),
            "rating_stars": round(float(row["final_score"]) * 5, 1),
        })

    return results


def rank_initiators(df: pd.DataFrame = None) -> list:
    """
    Rank initiators (item_id) by composite ML score.
    Compatible with the frontend RecommendationScreen.

    Returns:
        list of dicts with initiatorId, name, score, cluster
    """
    if df is None:
        if not os.path.exists(CSV_PATH):
            return []
        df = pd.read_csv(CSV_PATH)

    # Normalize column names
    if "feedback" in df.columns and "feedback_text" not in df.columns:
        df = df.rename(columns={"feedback": "feedback_text"})

    if df.empty or "feedback_text" not in df.columns:
        return []

    df = df.copy()
    df["sentiment_score"] = df["feedback_text"].apply(get_sentiment_score)
    df["rating"] = pd.to_numeric(df["rating"], errors="coerce").fillna(3.0)

    # Group by item_id (treated as initiator)
    grouped = df.groupby("item_id").agg(
        avg_rating=("rating", "mean"),
        avg_sentiment=("sentiment_score", "mean"),
        total_feedback=("rating", "count"),
    ).reset_index()

    grouped["rating_normalized"] = grouped["avg_rating"] / 5.0
    grouped["final_score"] = (
        grouped["rating_normalized"] * 0.40 +
        grouped["avg_sentiment"] * 0.60
    )

    grouped = grouped.sort_values("final_score", ascending=False)

    results = []
    for rank, (_, row) in enumerate(grouped.iterrows()):
        results.append({
            "initiatorId": row["item_id"],
            "name": f"Initiator {row['item_id']}",
            "score": round(float(row["final_score"]), 4),
            "cluster": rank % 5,  # Assign cluster for UI color coding
            "avg_rating": round(float(row["avg_rating"]), 2),
            "sentiment_score": round(float(row["avg_sentiment"]), 4),
            "total_feedback": int(row["total_feedback"]),
        })

    return results


def rank_initiators_v2(
    initiators_data: list,
    ratings_data: dict = None,
    completed_data: dict = None,
) -> list:
    """
    Upgraded initiator ranking using:
        score = (avg_rating/5 × WEIGHT_RATING) + (completed/MAX_COMPLETED × WEIGHT_COMPLETED)

    Args:
        initiators_data: list of dicts with at least {initiatorId, name, avgRating, completedCommittees}
        ratings_data:    optional dict {initiatorId: [list of ratings]}
        completed_data:  optional dict {initiatorId: count}

    Returns:
        sorted list with rank, rankLabel, score fields added
    """
    if not initiators_data:
        return []

    results = []
    for item in initiators_data:
        iid = item.get("initiatorId") or item.get("id", "")

        # Rating: prefer live ratings_data over stored field
        if ratings_data and iid in ratings_data and ratings_data[iid]:
            r_list = [float(r) for r in ratings_data[iid] if r]
            avg_rating = sum(r_list) / len(r_list) if r_list else 0.0
            total_ratings = len(r_list)
        else:
            avg_rating = float(item.get("avgRating") or item.get("avg_rating") or 0)
            total_ratings = int(item.get("totalRatings") or item.get("total_feedback") or 0)

        # Completed committees
        if completed_data and iid in completed_data:
            completed = int(completed_data[iid])
        else:
            completed = int(item.get("completedCommittees") or 0)

        # Normalize
        rating_norm    = min(avg_rating / 5.0, 1.0)
        completed_norm = min(completed / MAX_COMPLETED, 1.0)

        score = (rating_norm * WEIGHT_RATING) + (completed_norm * WEIGHT_COMPLETED)

        results.append({
            **item,
            "initiatorId":        iid,
            "avgRating":          round(avg_rating, 1),
            "totalRatings":       total_ratings,
            "completedCommittees": completed,
            "score":              round(score, 4),
        })

    # Sort by score descending
    results.sort(key=lambda x: x["score"], reverse=True)

    # Add rank labels
    rank_labels = {0: "#1 Top Initiator", 1: "#2 Second", 2: "#3 Third"}
    for idx, item in enumerate(results):
        item["rank"]      = idx + 1
        item["rankLabel"] = rank_labels.get(idx, f"#{idx + 1}")
        item["cluster"]   = idx % 5  # UI colour coding

    return results


# ── CLI Test ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    load_model()

    print("\n" + "=" * 60)
    print("  Committee Rankings")
    print("=" * 60)
    for item in rank_committees():
        print(f"  #{item['rank']} {item['committee_id']:>4}  "
              f"Score: {item['final_score']:.3f}  "
              f"Rating: {item['avg_rating']:.1f}*  "
              f"Sentiment: {item['sentiment_score']:.3f}  "
              f"({item['total_feedback']} reviews)")

    print("\n" + "=" * 60)
    print("  Initiator Rankings (v1 — ML CSV)")
    print("=" * 60)
    for item in rank_initiators():
        print(f"  {item['initiatorId']:>4}  "
              f"Score: {item['score']:.3f}  "
              f"Rating: {item['avg_rating']:.1f}*  "
              f"Cluster: {item['cluster']}")

    print("\n" + "=" * 60)
    print("  Initiator Rankings (v2 — rating + completed)")
    print("=" * 60)
    sample = [
        {"initiatorId": "I1", "name": "Ali Khan",    "avgRating": 4.5, "completedCommittees": 5},
        {"initiatorId": "I2", "name": "Sara Ahmed",  "avgRating": 3.8, "completedCommittees": 12},
        {"initiatorId": "I3", "name": "Usman Raza",  "avgRating": 5.0, "completedCommittees": 2},
    ]
    for item in rank_initiators_v2(sample):
        print(f"  {item['rankLabel']:20}  {item['name']:15}  "
              f"Score: {item['score']:.3f}  Rating: {item['avgRating']}*  "
              f"Completed: {item['completedCommittees']}")

