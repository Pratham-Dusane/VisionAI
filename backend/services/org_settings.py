from datetime import datetime


DEFAULT_ORG_SETTINGS = {
    "benchmarking_opt_in": False,
    "email_notifications": True,
    "explain_rejection_enabled": False,
}


ALLOWED_KEYS = set(DEFAULT_ORG_SETTINGS.keys())


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
            current[key] = bool(patch[key])

    db.collection("organizations").document(org_id).set(
        {
            "settings": current,
            "updatedAt": datetime.utcnow().isoformat(),
        },
        merge=True,
    )

    return current
