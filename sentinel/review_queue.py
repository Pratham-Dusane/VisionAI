from google.cloud import firestore
from datetime import datetime, UTC
import uuid

REVIEW_QUEUE_COLLECTION = "sentinel_review_queue"

async def enqueue_for_review(
    db: firestore.AsyncClient,
    sentinel_id: str,
    org_id: str,
    model_name: str,
    original_request: dict,
    model_raw_response: dict,
    protected_attribute_values: dict,
    trip_reason: dict,
) -> str:
    """
    Saves an intercepted decision to the manual review queue.
    Returns the review_id for inclusion in the response to the client.
    """
    review_id = str(uuid.uuid4())
    
    review_doc = {
        "review_id": review_id,
        "sentinel_id": sentinel_id,
        "org_id": org_id,
        "model_name": model_name,
        "status": "PENDING",                          # PENDING | REVIEWED | APPROVED | REJECTED
        "enqueued_at": datetime.now(UTC).isoformat(),
        "reviewed_at": None,
        "reviewed_by": None,
        "original_request": original_request,          # Full original feature payload
        "model_raw_response": model_raw_response,      # What the model actually said
        "protected_attribute_values": protected_attribute_values,
        "trip_reason": trip_reason,
        "reviewer_notes": None,
        "final_decision": None,                       # "APPROVED" | "REJECTED" set by human reviewer
    }
    
    await db.collection(REVIEW_QUEUE_COLLECTION).document(review_id).set(review_doc)
    return review_id
