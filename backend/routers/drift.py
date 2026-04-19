from __future__ import annotations

import json
import os
from datetime import datetime
from io import BytesIO
from uuid import uuid4

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from firebase_admin import firestore, storage
from google.cloud.firestore_v1.base_query import FieldFilter

from services.analysis.data_bias_scanner import scan_data_bias
from services.analysis.severity_scorer import compute_severity_score

try:
    from google.cloud import bigquery
except Exception:
    bigquery = None


router = APIRouter()


def _parse_protected_cols(raw: str) -> list[str]:
    value = (raw or "").strip()
    if not value:
        raise ValueError("protectedCols is required")

    if value.startswith("["):
        parsed = json.loads(value)
        if not isinstance(parsed, list):
            raise ValueError("protectedCols must be a JSON array")
        cols = [str(item).strip() for item in parsed if str(item).strip()]
    else:
        cols = [part.strip() for part in value.split(",") if part.strip()]

    if not cols:
        raise ValueError("protectedCols must include at least one column")
    return cols


def _load_dataframe(filename: str, data: bytes) -> pd.DataFrame:
    ext = os.path.splitext(filename or "")[1].lower()
    stream = BytesIO(data)

    if ext == ".csv":
        return pd.read_csv(stream)
    if ext == ".json":
        return pd.read_json(stream)
    if ext == ".parquet":
        return pd.read_parquet(stream)

    raise ValueError(f"Unsupported file format: {ext or 'unknown'}")


def _compute_equalized_odds(
    df: pd.DataFrame,
    protected_cols: list[str],
    label_col: str,
    positive_label: str,
    prediction_col: str | None,
) -> dict:
    if not prediction_col or prediction_col not in df.columns or label_col not in df.columns:
        return {}

    y_true = df[label_col].astype(str)
    y_pred = df[prediction_col].astype(str)
    pos = str(positive_label)

    results: dict[str, dict] = {}

    for col in protected_cols:
        if col not in df.columns:
            continue

        groups = [str(g) for g in df[col].dropna().unique()]
        if len(groups) < 2:
            continue

        per_group: dict[str, dict[str, float]] = {}
        fprs: list[float] = []

        for group in groups:
            mask = df[col].astype(str) == group
            grp_true = y_true[mask]
            grp_pred = y_pred[mask]

            negatives = (grp_true != pos)
            negatives_count = int(negatives.sum())
            false_positives = int(((grp_pred == pos) & negatives).sum())
            fpr = (false_positives / negatives_count) if negatives_count > 0 else 0.0

            positives = (grp_true == pos)
            positives_count = int(positives.sum())
            false_negatives = int(((grp_pred != pos) & positives).sum())
            fnr = (false_negatives / positives_count) if positives_count > 0 else 0.0

            per_group[group] = {
                "fpr": round(float(fpr), 4),
                "fnr": round(float(fnr), 4),
            }
            fprs.append(float(fpr))

        fpr_gap = (max(fprs) - min(fprs)) if len(fprs) >= 2 else 0.0

        results[col] = {
            "groups": per_group,
            "fpr_gap": round(float(fpr_gap), 4),
        }

    return results


def _count_unread_notifications(db, org_id: str) -> int:
    docs = (
        db.collection("notifications")
        .where(filter=FieldFilter("orgId", "==", org_id))
        .stream()
    )
    unread = 0
    for doc in docs:
        payload = doc.to_dict() or {}
        if payload.get("type") == "DRIFT_ALERT" and not bool(payload.get("read", False)):
            unread += 1
    return unread


def _list_org_drift_notifications(db, org_id: str) -> list[dict]:
    docs = (
        db.collection("notifications")
        .where(filter=FieldFilter("orgId", "==", org_id))
        .stream()
    )

    items = []
    for doc in docs:
        payload = doc.to_dict() or {}
        if payload.get("type") != "DRIFT_ALERT":
            continue
        payload["id"] = doc.id
        items.append(payload)

    items.sort(key=lambda item: item.get("createdAt") or "", reverse=True)
    return items


def _persist_bigquery_rows(rows: list[dict]) -> None:
    if not rows or bigquery is None:
        return

    dataset = os.getenv("BIGQUERY_DATASET", "visionai_analytics")
    table_ref = f"{dataset}.drift_metrics"
    try:
        client = bigquery.Client()
        client.insert_rows_json(table_ref, rows)
    except Exception:
        # Local/dev environments may not have BigQuery configured.
        return


@router.post("/upload")
async def upload_drift_batch(
    orgId: str = Form(...),
    batchDate: str = Form(...),
    labelCol: str = Form(...),
    positiveLabel: str = Form("1"),
    protectedCols: str = Form(...),
    notes: str = Form(""),
    auditId: str | None = Form(None),
    predictionCol: str | None = Form(None),
    file: UploadFile = File(...),
):
    db = firestore.client()

    try:
        parsed_batch_date = datetime.fromisoformat(batchDate)
    except ValueError:
        raise HTTPException(status_code=400, detail="batchDate must be a valid ISO date")

    try:
        protected_cols = _parse_protected_cols(protectedCols)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        raw_data = await file.read()
        if not raw_data:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        df = _load_dataframe(file.filename or "dataset.csv", raw_data)
        if labelCol not in df.columns:
            raise HTTPException(status_code=400, detail=f"labelCol '{labelCol}' not found in dataset")

        missing = [col for col in protected_cols if col not in df.columns]
        if missing:
            raise HTTPException(status_code=400, detail=f"Protected columns missing from dataset: {missing}")

        data_bias = scan_data_bias(
            df=df,
            label_col=labelCol,
            positive_label=positiveLabel,
            protected_cols=protected_cols,
        )
        score = compute_severity_score(
            data_bias=data_bias,
            proxies=[],
            intersectional=[],
            feature_laundering=[],
            model_bias=None,
        )
        equalized_odds = _compute_equalized_odds(
            df=df,
            protected_cols=protected_cols,
            label_col=labelCol,
            positive_label=positiveLabel,
            prediction_col=predictionCol,
        )

        now = datetime.utcnow()
        drift_id = f"drift_{uuid4().hex[:12]}"

        bucket = storage.bucket()
        storage_key = f"drift_uploads/{orgId}/{drift_id}_{file.filename or 'dataset.csv'}"
        blob = bucket.blob(storage_key)
        blob.upload_from_string(raw_data, content_type=file.content_type or "application/octet-stream")
        storage_path = f"gs://{bucket.name}/{storage_key}"

        metrics: list[dict] = []
        bq_rows: list[dict] = []

        for attr, result in data_bias.items():
            di = result.get("metrics", {}).get("disparate_impact")
            spd = result.get("metrics", {}).get("statistical_parity_difference")
            severity = result.get("severity", "PASS")

            metric_row = {
                "protectedAttribute": attr,
                "diRatio": di,
                "spd": spd,
                "severity": severity,
            }
            if attr in equalized_odds:
                metric_row["equalizedOdds"] = equalized_odds[attr]

            metrics.append(metric_row)
            bq_rows.append(
                {
                    "org_id": orgId,
                    "audit_id": auditId,
                    "batch_date": parsed_batch_date.isoformat(),
                    "upload_date": now.isoformat(),
                    "protected_attribute": attr,
                    "di_ratio": di,
                    "spd": spd,
                    "fairness_score": float(score["fairness_score"]),
                    "row_count": int(len(df)),
                }
            )

        _persist_bigquery_rows(bq_rows)

        worst_di = min(
            [float(m["diRatio"]) for m in metrics if isinstance(m.get("diRatio"), (int, float))],
            default=1.0,
        )
        alert_triggered = worst_di < 0.8

        batch_doc = {
            "orgId": orgId,
            "auditId": auditId,
            "batchDate": parsed_batch_date.isoformat(),
            "uploadDate": now.isoformat(),
            "notes": notes,
            "rowCount": int(len(df)),
            "storagePath": storage_path,
            "fairnessScore": float(score["fairness_score"]),
            "letterGrade": score["letter_grade"],
            "metrics": metrics,
            "worstDi": round(float(worst_di), 4),
            "alertTriggered": alert_triggered,
            "status": "COMPLETE",
            "createdAt": now.isoformat(),
        }

        db.collection("drift_batches").document(drift_id).set(batch_doc)

        if alert_triggered:
            message = f"Drift alert: latest batch DI dropped to {worst_di:.2f}"
            db.collection("notifications").add(
                {
                    "orgId": orgId,
                    "type": "DRIFT_ALERT",
                    "title": "Fairness Drift Alert",
                    "message": message,
                    "batchId": drift_id,
                    "read": False,
                    "createdAt": now.isoformat(),
                }
            )

        return {
            "orgId": orgId,
            "batchId": drift_id,
            "summary": {
                "fairnessScore": float(score["fairness_score"]),
                "letterGrade": score["letter_grade"],
                "worstDi": round(float(worst_di), 4),
                "rowCount": int(len(df)),
                "alertTriggered": alert_triggered,
            },
            "batch": batch_doc,
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Drift upload failed: {str(e)}")


@router.get("/{org_id}")
async def get_drift_history(org_id: str):
    try:
        db = firestore.client()
        docs = (
            db.collection("drift_batches")
            .where(filter=FieldFilter("orgId", "==", org_id))
            .stream()
        )

        batches = []
        for doc in docs:
            payload = doc.to_dict() or {}
            payload["id"] = doc.id
            batches.append(payload)

        batches.sort(key=lambda item: item.get("batchDate") or "")

        latest_alert = False
        if batches:
            latest = batches[-1]
            latest_alert = bool(latest.get("alertTriggered", False))

        return {
            "orgId": org_id,
            "batches": batches,
            "latestAlert": latest_alert,
            "notificationCount": _count_unread_notifications(db, org_id),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load drift history: {str(e)}")


@router.get("/{org_id}/notifications/count")
async def get_drift_notification_count(org_id: str):
    try:
        db = firestore.client()
        return {
            "orgId": org_id,
            "unread": _count_unread_notifications(db, org_id),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load notification count: {str(e)}")


@router.get("/{org_id}/notifications")
async def list_drift_notifications(org_id: str):
    try:
        db = firestore.client()
        notifications = _list_org_drift_notifications(db, org_id)
        return {
            "orgId": org_id,
            "notifications": notifications,
            "unread": sum(1 for item in notifications if not bool(item.get("read", False))),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load notifications: {str(e)}")


@router.post("/{org_id}/notifications/{notification_id}/read")
async def mark_drift_notification_read(org_id: str, notification_id: str):
    try:
        db = firestore.client()
        ref = db.collection("notifications").document(notification_id)
        doc = ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Notification not found")

        payload = doc.to_dict() or {}
        if payload.get("orgId") != org_id:
            raise HTTPException(status_code=403, detail="Notification does not belong to organization")

        ref.update({
            "read": True,
            "readAt": datetime.utcnow().isoformat(),
        })

        return {
            "orgId": org_id,
            "notificationId": notification_id,
            "read": True,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update notification: {str(e)}")


@router.post("/{org_id}/notifications/read-all")
async def mark_all_drift_notifications_read(org_id: str):
    try:
        db = firestore.client()
        notifications = _list_org_drift_notifications(db, org_id)
        updated = 0
        now = datetime.utcnow().isoformat()

        for item in notifications:
            if bool(item.get("read", False)):
                continue
            db.collection("notifications").document(item["id"]).update({
                "read": True,
                "readAt": now,
            })
            updated += 1

        return {
            "orgId": org_id,
            "updated": updated,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update notifications: {str(e)}")
