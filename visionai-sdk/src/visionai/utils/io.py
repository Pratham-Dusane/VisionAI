"""Utility I/O helpers for loading data and models."""

from pathlib import Path
from typing import Union

import pandas as pd


def load_dataframe(source: Union[str, Path, pd.DataFrame]) -> pd.DataFrame:
    """
    Load a DataFrame from a file path, Path object, or pass through existing DataFrame.

    Supports: .csv, .json, .parquet
    """
    if isinstance(source, pd.DataFrame):
        return source.copy()

    path = Path(source)
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    ext = path.suffix.lower()
    if ext == ".csv":
        return pd.read_csv(path)
    elif ext == ".json":
        return pd.read_json(path)
    elif ext == ".parquet":
        return pd.read_parquet(path)
    else:
        raise ValueError(
            f"Unsupported file format: '{ext}'. "
            f"Supported: .csv, .json, .parquet"
        )


def load_model(source: Union[str, Path, object]):
    """
    Load an ML model from a file path or pass through existing model object.

    Supports: .pkl, .joblib (scikit-learn compatible)
    Returns None if source is None.
    """
    if source is None:
        return None

    # Already a model object
    if not isinstance(source, (str, Path)):
        return source

    import joblib

    path = Path(source)
    if not path.exists():
        raise FileNotFoundError(f"Model file not found: {path}")

    try:
        return joblib.load(path)
    except Exception as e:
        raise RuntimeError(f"Failed to load model from {path}: {e}") from e
