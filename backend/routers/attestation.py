from fastapi import APIRouter
from services.attestation.chain import verify_chain_integrity
from firebase_admin import firestore

router = APIRouter()


@router.get("/{org_id}/{model_identifier}")
async def get_attestation_chain(org_id: str, model_identifier: str):
    """Retrieve full attestation history for a model identifier."""
    db = firestore.client()
    chain_ref = db.collection("attestation_chains").document(f"{org_id}_{model_identifier}")
    doc = chain_ref.get()
    if not doc.exists:
        return {"exists": False}
    return {"exists": True, **doc.to_dict()}


@router.get("/{org_id}/{model_identifier}/verify")
async def verify_chain(org_id: str, model_identifier: str):
    """Run cryptographic verify checks on the attestation hash chain links."""
    return verify_chain_integrity(org_id, model_identifier)
