from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from firebase_admin import firestore

from services.org_settings import get_org_settings, update_org_settings


router = APIRouter()


class UpdateSettingsRequest(BaseModel):
    benchmarking_opt_in: bool | None = None
    email_notifications: bool | None = None
    explain_rejection_enabled: bool | None = None
    explain_my_rejection_enabled: bool | None = None


@router.get("/{org_id}/settings")
async def get_settings(org_id: str):
    try:
        db = firestore.client()
        settings = get_org_settings(db, org_id)
        response_settings = dict(settings)
        response_settings["explain_my_rejection_enabled"] = settings.get("explain_rejection_enabled", False)
        return {
            "orgId": org_id,
            "settings": response_settings,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read settings: {str(e)}")


@router.put("/{org_id}/settings")
async def put_settings(org_id: str, req: UpdateSettingsRequest):
    try:
        db = firestore.client()
        patch = req.model_dump(exclude_unset=True)
        if "explain_my_rejection_enabled" in patch and "explain_rejection_enabled" not in patch:
            patch["explain_rejection_enabled"] = patch["explain_my_rejection_enabled"]
        patch.pop("explain_my_rejection_enabled", None)

        settings = update_org_settings(db, org_id, patch)
        response_settings = dict(settings)
        response_settings["explain_my_rejection_enabled"] = settings.get("explain_rejection_enabled", False)
        return {
            "orgId": org_id,
            "settings": response_settings,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update settings: {str(e)}")
