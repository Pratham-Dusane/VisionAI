"""
Low-resource backend dev launcher.

Default mode runs without autoreload to avoid heavy file watching on large repos.
Set VISIONAI_BACKEND_RELOAD=1 to enable reload with constrained watch paths.
"""

from __future__ import annotations

import os
from pathlib import Path

import uvicorn

BASE_DIR = Path(__file__).resolve().parent


def _as_bool(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def main() -> None:
    host = os.getenv("VISIONAI_BACKEND_HOST", "127.0.0.1")
    port = int(os.getenv("VISIONAI_BACKEND_PORT", "8000"))
    use_reload = _as_bool(os.getenv("VISIONAI_BACKEND_RELOAD"))

    kwargs: dict = {
        "app": "main:app",
        "host": host,
        "port": port,
    }

    if use_reload:
        kwargs.update(
            {
                "reload": True,
                "reload_dirs": [
                    str(BASE_DIR),
                    str(BASE_DIR / "core"),
                    str(BASE_DIR / "routers"),
                    str(BASE_DIR / "services"),
                ],
                "reload_excludes": [
                    "*.pyc",
                    "**/__pycache__/**",
                    "**/.venv/**",
                    "**/temp_uploads/**",
                    "**/services/reporting/node_pdf/node_modules/**",
                ],
            }
        )

    uvicorn.run(**kwargs)


if __name__ == "__main__":
    main()
