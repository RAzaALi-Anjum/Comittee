"""
train_model.py — Committee Feedback Sentiment Model Training
═══════════════════════════════════════════════════════════════
Trains a TF-IDF + Logistic Regression pipeline for sentiment
analysis on committee feedback text.

Usage:
    python train_model.py

Output:
    model.pkl       — Trained LogisticRegression model
    vectorizer.pkl  — Fitted TfidfVectorizer
"""

import os
import sys
import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, accuracy_score
import joblib

# ── Paths ───────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "data", "feedback.csv")
MODEL_PATH = os.path.join(BASE_DIR, "model.pkl")
VECTORIZER_PATH = os.path.join(BASE_DIR, "vectorizer.pkl")


def generate_synthetic_data():
    """Generate synthetic training data when CSV is too small."""
    positive_templates = [
        "excellent service very professional and organized",
        "great experience highly recommended and trustworthy",
        "amazing work outstanding quality and timely delivery",
        "wonderful team fantastic results very satisfied",
        "best committee ever honest and transparent management",
        "top notch service reliable and punctual initiator",
        "brilliant work exceeded all expectations truly happy",
        "perfect management everything ran smoothly on schedule",
        "very good quality professional team loved the experience",
        "highly recommended great communication and fair process",
        "superb committee management and wonderful results overall",
        "exceptional quality of work and very helpful team members",
        "truly outstanding the initiator was incredibly professional",
        "absolutely fantastic experience would join again anytime",
        "remarkable service and attention to detail very impressed",
    ]
    negative_templates = [
        "bad service poor communication and delayed payments",
        "terrible experience unprofessional and rude initiator",
        "worst committee ever disorganized and unreliable",
        "fraud committee the initiator cheated everyone",
        "scam alert fake committee and dishonest management",
        "horrible experience stolen money and fake promises",
        "not satisfied low quality work and poor finishing",
        "disappointed with the service very bad management",
        "complete disaster avoid this committee at all costs",
        "missing payments and no accountability worst ever",
        "extremely poor quality and totally unprofessional work",
        "waste of time and money the committee was a failure",
        "terrible management and very rude behavior from initiator",
        "absolutely horrible would never recommend this to anyone",
        "the worst experience I have ever had completely dishonest",
    ]

    rows = []
    for i, text in enumerate(positive_templates):
        rows.append({
            "user_id": f"SYN_P{i}",
            "committee_id": f"C{(i % 4) + 1}",
            "item_id": f"I{(i % 6) + 1}",
            "feedback_text": text,
            "rating": np.random.choice([4, 5]),
        })
    for i, text in enumerate(negative_templates):
        rows.append({
            "user_id": f"SYN_N{i}",
            "committee_id": f"C{(i % 4) + 1}",
            "item_id": f"I{(i % 6) + 1}",
            "feedback_text": text,
            "rating": np.random.choice([1, 2]),
        })
    return pd.DataFrame(rows)


def load_data():
    """Load feedback CSV. Merge with synthetic data if too small."""
    if os.path.exists(CSV_PATH):
        df = pd.read_csv(CSV_PATH)
        # Normalize column names (support both 'feedback' and 'feedback_text')
        if "feedback" in df.columns and "feedback_text" not in df.columns:
            df = df.rename(columns={"feedback": "feedback_text"})
    else:
        df = pd.DataFrame(columns=["user_id", "committee_id", "item_id", "feedback_text", "rating"])

    # Add synthetic data if dataset is too small for reliable training
    if len(df) < 30:
        synthetic = generate_synthetic_data()
        df = pd.concat([df, synthetic], ignore_index=True)
        print(f"[Train] Added {len(synthetic)} synthetic rows (total: {len(df)})")

    # Create binary sentiment label: rating >= 4 → positive (1), else negative (0)
    df["label"] = df["rating"].apply(lambda x: 1 if x >= 4 else 0)

    # Drop rows with empty feedback
    df = df.dropna(subset=["feedback_text"])
    df = df[df["feedback_text"].str.strip().astype(bool)]

    return df


def train():
    """Train TF-IDF + Logistic Regression model."""
    print("=" * 60)
    print("  Committee Feedback Sentiment Model -- Training")
    print("=" * 60)

    df = load_data()
    print(f"\n[Data] Total samples: {len(df)}")
    print(f"[Data] Positive: {(df['label'] == 1).sum()} | Negative: {(df['label'] == 0).sum()}")

    X = df["feedback_text"].values
    y = df["label"].values

    # TF-IDF Vectorizer
    vectorizer = TfidfVectorizer(
        max_features=5000,
        ngram_range=(1, 2),      # unigrams + bigrams
        stop_words="english",
        min_df=1,
        max_df=0.95,
    )

    X_vec = vectorizer.fit_transform(X)

    # Train/Test Split
    X_train, X_test, y_train, y_test = train_test_split(
        X_vec, y, test_size=0.2, random_state=42, stratify=y
    )

    # Logistic Regression
    model = LogisticRegression(
        max_iter=1000,
        C=1.0,
        solver="liblinear",
        class_weight="balanced",
    )
    model.fit(X_train, y_train)

    # Evaluation
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)

    print(f"\n[Results] Accuracy: {accuracy:.2%}")
    print("\n[Classification Report]")
    print(classification_report(y_test, y_pred, target_names=["Negative", "Positive"]))

    # Cross-validation
    cv_scores = cross_val_score(model, X_vec, y, cv=min(5, len(df) // 4 or 2), scoring="accuracy")
    print(f"[Cross-Val] Mean Accuracy: {cv_scores.mean():.2%} (±{cv_scores.std():.2%})")

    # Save model and vectorizer
    joblib.dump(model, MODEL_PATH)
    joblib.dump(vectorizer, VECTORIZER_PATH)

    print(f"\n[Saved] model.pkl       -> {MODEL_PATH}")
    print(f"[Saved] vectorizer.pkl  -> {VECTORIZER_PATH}")
    print("=" * 60)

    return model, vectorizer


if __name__ == "__main__":
    train()
