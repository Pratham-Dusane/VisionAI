from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pandas as pd
from pathlib import Path

from core.firebase_init import download_from_storage, cleanup_temp_file
from services.preprocessing.schema_parser import parse_schema
from services.preprocessing.proxy_detector import detect_proxies
from services.preprocessing.data_profiler import profile_data

router = APIRouter()


def _load_dataframe(local_path: Path) -> pd.DataFrame:
    """Load a dataset file into a DataFrame based on extension."""
    ext = local_path.suffix.lower()
    if ext == ".csv":
        return pd.read_csv(local_path)
    elif ext == ".json":
        return pd.read_json(local_path)
    elif ext == ".parquet":
        return pd.read_parquet(local_path)
    else:
        raise ValueError(f"Unsupported file format: {ext}")


class DatasetRequest(BaseModel):
    storagePath: str


class PreprocessRequest(BaseModel):
    storagePath: str
    protectedCols: list[str]
    labelCol: str
    positiveLabel: str


@router.post("/dataset")
async def analyze_dataset(req: DatasetRequest):
    """
    Download dataset from Firebase Storage, run schema parser,
    return column metadata + preview rows.
    """
    local_path = None
    try:
        # Download from GCS
        local_path = download_from_storage(req.storagePath)

        # Load into DataFrame
        df = _load_dataframe(local_path)

        # Run schema parser
        schema = parse_schema(df)

        # Get preview rows (first 5)
        preview_rows = []
        preview_df = df.head(5)
        for _, row in preview_df.iterrows():
            preview_rows.append({
                col: _serialize_value(row[col]) for col in df.columns
            })

        return {
            "schema": schema,
            "preview": preview_rows,
        }

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Schema parsing failed: {str(e)}")
    finally:
        if local_path:
            cleanup_temp_file(local_path)


@router.post("/preprocess")
async def preprocess_dataset(req: PreprocessRequest):
    """
    Download dataset, run proxy detector + data profiler.
    Called after user confirms protected attributes in Step 2.
    """
    local_path = None
    try:
        local_path = download_from_storage(req.storagePath)
        df = _load_dataframe(local_path)

        # Run proxy detection
        proxies = detect_proxies(df, req.protectedCols)

        # Run data profiler
        profiles = profile_data(
            df,
            req.protectedCols,
            req.labelCol,
            req.positiveLabel,
        )

        return {
            "proxies": proxies,
            "profiles": profiles,
        }

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preprocessing failed: {str(e)}")
    finally:
        if local_path:
            cleanup_temp_file(local_path)


def _serialize_value(val) -> str:
    """Convert a pandas value to a JSON-safe string."""
    if pd.isna(val):
        return ""
    return str(val)
