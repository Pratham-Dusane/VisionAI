from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from firebase_admin import firestore

from services.org_settings import (
    generate_org_api_key,
    get_org_settings,
    list_org_api_keys,
    revoke_org_api_key,
    update_org_settings,
)


router = APIRouter()


class UpdateSettingsRequest(BaseModel):
    benchmarking_opt_in: bool | None = None
    email_notifications: bool | None = None
    explain_rejection_enabled: bool | None = None
    explain_my_rejection_enabled: bool | None = None
    org_logo_url: str | None = None


class CreateApiKeyRequest(BaseModel):
    label: str | None = None


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


@router.get("/{org_id}/api-keys")
async def get_api_keys(org_id: str):
    try:
        db = firestore.client()
        return {
            "orgId": org_id,
            "apiKeys": list_org_api_keys(db, org_id),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list API keys: {str(e)}")


@router.post("/{org_id}/api-keys")
async def create_api_key(org_id: str, req: CreateApiKeyRequest | None = None):
    try:
        db = firestore.client()
        created = generate_org_api_key(
            db,
            org_id,
            label=(req.label if req else None),
        )
        return {
            "orgId": org_id,
            **created,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create API key: {str(e)}")


@router.delete("/{org_id}/api-keys/{key_id}")
async def delete_api_key(org_id: str, key_id: str):
    try:
        db = firestore.client()
        revoked = revoke_org_api_key(db, org_id, key_id)
        if not revoked:
            raise HTTPException(status_code=404, detail="API key not found")

        return {
            "orgId": org_id,
            "keyId": key_id,
            "revoked": True,
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to revoke API key: {str(e)}")
