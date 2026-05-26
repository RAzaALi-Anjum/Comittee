# Committee Feedback & Recommendation System (ML)

Production-grade ML-powered feedback analysis and committee ranking system.

## Features
- **ML Sentiment Analysis** — TF-IDF + Logistic Regression pipeline
- **Dynamic Rankings** — Composite score: 40% rating + 60% ML sentiment
- **Auto-Initialization** — Model loads/trains automatically on server start
- **REST API** — FastAPI with real-time feedback processing
- **Backend Integration** — Node.js forwarding with graceful fallback

## Architecture

```
/ML Model
├── app.py                  # FastAPI server (port 8000)
├── train_model.py          # Model training pipeline
├── recommendation.py       # Ranking & sentiment engine
├── model.pkl               # Trained model (auto-generated)
├── vectorizer.pkl          # TF-IDF vectorizer (auto-generated)
├── requirements.txt        # Python dependencies
├── data/
│   └── feedback.csv        # Feedback dataset
└── README.md
```

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Train the model (optional — auto-trains on first start)
python train_model.py

# 3. Start the API server
python app.py
# Or: uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

## API Endpoints

| Method | Endpoint               | Description                                  |
|--------|------------------------|----------------------------------------------|
| POST   | `/feedback`            | Submit feedback → save + ML sentiment score  |
| GET    | `/recommendations`     | Ranked committees by composite ML score      |
| POST   | `/recommend-initiators`| Ranked initiators (frontend compatible)      |
| POST   | `/analyze`             | Analyze text sentiment without saving        |
| POST   | `/retrain`             | Retrain model from latest CSV data           |
| GET    | `/health`              | Health check with system status              |

## Scoring Formula

```
final_score = (rating_normalized × 0.40) + (ml_sentiment_score × 0.60)
```

Where:
- `rating_normalized` = mean_rating / 5.0
- `ml_sentiment_score` = LogisticRegression predict_proba (positive class)
