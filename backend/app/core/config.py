import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL, make_url

ROOT = Path(__file__).resolve().parents[3]


def database_url(variable: str = "DATABASE_URL") -> URL:
    load_dotenv(ROOT / ".env", override=False)
    value = os.getenv(variable)
    if not value:
        raise RuntimeError(f"Set {variable}; see .env.example.")
    try:
        url = make_url(value)
    except Exception:
        raise RuntimeError(f"Invalid {variable} configuration.") from None
    if url.drivername != "postgresql+psycopg":
        raise RuntimeError(f"{variable} must use postgresql+psycopg.")
    return url
