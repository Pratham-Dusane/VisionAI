"""
Benchmark router - Sector benchmarking insights.
Provides aggregated fairness statistics for a given domain.
"""

from fastapi import APIRouter, HTTPException
from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

try:
    from google.cloud import bigquery
except Exception:
    bigquery = None


router = APIRouter()


def _load_peer_scores(domain: str) -> list[float]:
    scores: list[float] = []

    if bigquery is not None:
        try:
            bq = bigquery.Client()
            query = """
                SELECT fairness_score
                FROM `visionai_analytics.sector_benchmarks`
                WHERE domain = @domain AND opt_in = TRUE
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("domain", "STRING", domain),
                ]
            )
            rows = bq.query(query, job_config=job_config).result()
            scores = [float(r.fairness_score) for r in rows if r.fairness_score is not None]
        except Exception:
            scores = []

    if scores:
        return scores

    db = firestore.client()
    docs = (
        db.collection("sector_benchmarks")
        .where(filter=FieldFilter("domain", "==", domain))
        .where(filter=FieldFilter("opt_in", "==", True))
        .stream()
    )

    for doc in docs:
        data = doc.to_dict() or {}
        score = data.get("fairness_score")
        if isinstance(score, (int, float)):
            scores.append(float(score))

    return scores


def _percentile_rank(sorted_scores: list[float], score: float) -> dict:
    count = len(sorted_scores)
    higher = sum(1 for s in sorted_scores if s > score)
    lower = sum(1 for s in sorted_scores if s < score)
    return {
        "worseThanPercent": round((higher / count) * 100, 1),
        "outperformPercent": round((lower / count) * 100, 1),
    }


@router.get("/{domain}")
async def get_sector_benchmark(domain: str, fairnessScore: float | None = None):
    """Get sector-level benchmarking statistics for a domain."""
    try:
        scores = _load_peer_scores(domain)
        if not scores:
            return {
                "domain": domain,
                "peerCount": 0,
                "message": "Benchmarking data is not available yet for this domain.",
                "averageFairnessScore": None,
                "medianFairnessScore": None,
                "p25FairnessScore": None,
                "p75FairnessScore": None,
            }

        sorted_scores = sorted(scores)
        count = len(sorted_scores)

        def pct(p: float) -> float:
            idx = int(round((count - 1) * p))
            return round(sorted_scores[idx], 2)

        payload = {
            "domain": domain,
            "peerCount": count,
            "averageFairnessScore": round(sum(sorted_scores) / count, 2),
            "medianFairnessScore": pct(0.5),
            "p25FairnessScore": pct(0.25),
            "p75FairnessScore": pct(0.75),
        }

        if fairnessScore is not None:
            ranking = _percentile_rank(sorted_scores, float(fairnessScore))
            payload.update(ranking)
            payload["message"] = (
                f"Your model's fairness score of {round(float(fairnessScore), 1)} is lower than "
                f"{ranking['worseThanPercent']}% of {domain} models audited on VisionAI."
            )

        return payload
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch sector benchmarks: {str(e)}")
