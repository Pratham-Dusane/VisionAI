from datetime import datetime
import hashlib
import secrets

from google.cloud.firestore_v1.base_query import FieldFilter


DEFAULT_ORG_SETTINGS = {
    "benchmarking_opt_in": False,
    "email_notifications": True,
    "explain_rejection_enabled": False,
    "shadow_testing_enabled": False,
    "org_logo_url": "",
}

API_KEY_PREFIX = "vai_live_"


ALLOWED_KEYS = set(DEFAULT_ORG_SETTINGS.keys())


def _utcnow_iso() -> str:
    return datetime.utcnow().isoformat()


def _hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def _mask_api_key(api_key: str) -> str:
    if len(api_key) <= 8:
        return f"{api_key[:4]}****"
    return f"{api_key[:12]}...{api_key[-4:]}"


def _normalize_label(label: str | None) -> str:
    value = (label or "").strip()
    return value[:64] if value else "CI/CD Key"


def get_org_settings(db, org_id: str) -> dict:
    if not org_id:
        return dict(DEFAULT_ORG_SETTINGS)

    doc = db.collection("organizations").document(org_id).get()
    if not doc.exists:
        return dict(DEFAULT_ORG_SETTINGS)

    data = doc.to_dict() or {}
    saved = data.get("settings", {}) or {}

    merged = dict(DEFAULT_ORG_SETTINGS)
    for key in ALLOWED_KEYS:
        if key in saved:
            if key == "org_logo_url":
                merged[key] = str(saved[key] or "").strip()
            else:
                merged[key] = bool(saved[key])

    # Backward compatibility with older key naming in stored documents.
    if "explain_rejection_enabled" not in saved and "explain_my_rejection_enabled" in saved:
        merged["explain_rejection_enabled"] = bool(saved["explain_my_rejection_enabled"])
    return merged


def update_org_settings(db, org_id: str, patch: dict) -> dict:
    if not org_id:
        raise ValueError("org_id is required")

    current = get_org_settings(db, org_id)
    for key in ALLOWED_KEYS:
        if key in patch and patch[key] is not None:
            if key == "org_logo_url":
                current[key] = str(patch[key] or "").strip()
            else:
                current[key] = bool(patch[key])

    db.collection("organizations").document(org_id).set(
        {
            "settings": current,
            "updatedAt": _utcnow_iso(),
        },
        merge=True,
    )

    return current


def generate_org_api_key(db, org_id: str, label: str | None = None) -> dict:
    if not org_id:
        raise ValueError("org_id is required")

    normalized_label = _normalize_label(label)

    for _ in range(5):
        token = secrets.token_urlsafe(24)
        raw_key = f"{API_KEY_PREFIX}{token}"
        key_hash = _hash_api_key(raw_key)
        doc_ref = db.collection("org_api_keys").document(key_hash)
        if doc_ref.get().exists:
            continue

        created_at = _utcnow_iso()
        doc_ref.set(
            {
                "orgId": org_id,
                "label": normalized_label,
                "active": True,
                "masked": _mask_api_key(raw_key),
                "createdAt": created_at,
                "updatedAt": created_at,
                "lastUsedAt": None,
                "revokedAt": None,
            }
        )
        return {
            "keyId": key_hash,
            "apiKey": raw_key,
            "masked": _mask_api_key(raw_key),
            "label": normalized_label,
            "active": True,
            "createdAt": created_at,
        }

    raise RuntimeError("Failed to generate a unique API key")


def list_org_api_keys(db, org_id: str) -> list[dict]:
    if not org_id:
        raise ValueError("org_id is required")

    docs = (
        db.collection("org_api_keys")
        .where(filter=FieldFilter("orgId", "==", org_id))
        .stream()
    )

    keys = []
    for doc in docs:
        data = doc.to_dict() or {}
        keys.append(
            {
                "keyId": doc.id,
                "label": data.get("label", "CI/CD Key"),
                "masked": data.get("masked", ""),
                "active": bool(data.get("active", False)),
                "createdAt": data.get("createdAt"),
                "updatedAt": data.get("updatedAt"),
                "lastUsedAt": data.get("lastUsedAt"),
                "revokedAt": data.get("revokedAt"),
            }
        )

    keys.sort(key=lambda k: k.get("createdAt") or "", reverse=True)
    return keys


def revoke_org_api_key(db, org_id: str, key_id: str) -> bool:
    if not org_id:
        raise ValueError("org_id is required")
    if not key_id:
        raise ValueError("key_id is required")

    doc_ref = db.collection("org_api_keys").document(key_id)
    doc = doc_ref.get()
    if not doc.exists:
        return False

    data = doc.to_dict() or {}
    if data.get("orgId") != org_id:
        raise ValueError("API key does not belong to this organization")

    now = _utcnow_iso()
    doc_ref.update(
        {
            "active": False,
            "revokedAt": now,
            "updatedAt": now,
        }
    )
    return True


def authenticate_org_api_key(db, api_key: str) -> dict | None:
    if not api_key or not isinstance(api_key, str):
        return None
    if not api_key.startswith(API_KEY_PREFIX):
        return None

    key_hash = _hash_api_key(api_key)
    doc_ref = db.collection("org_api_keys").document(key_hash)
    doc = doc_ref.get()
    if not doc.exists:
        return None

    data = doc.to_dict() or {}
    if not data.get("active", False):
        return None

    now = _utcnow_iso()
    try:
        doc_ref.update(
            {
                "lastUsedAt": now,
                "updatedAt": now,
            }
        )
    except Exception:
        # Auth should not fail only because last-used update failed.
        pass

    return {
        "orgId": data.get("orgId"),
        "keyId": doc.id,
        "label": data.get("label", "CI/CD Key"),
    }
