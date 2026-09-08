import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL, make_url

ROOT = Path(__file__).resolve().parents[3]


def _load_environment() -> None:
    load_dotenv(ROOT / ".env", override=False)


def database_url(variable: str = "DATABASE_URL") -> URL:
    _load_environment()
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


@dataclass(frozen=True, slots=True)
class PluggySettings:
    client_id: str
    client_secret: str
    base_url: str = "https://api.pluggy.ai"


def pluggy_settings() -> PluggySettings:
    _load_environment()
    client_id = os.getenv("PLUGGY_CLIENT_ID", "").strip()
    client_secret = os.getenv("PLUGGY_CLIENT_SECRET", "").strip()
    base_url = os.getenv("PLUGGY_BASE_URL", "https://api.pluggy.ai").strip().rstrip("/")
    if not client_id or not client_secret:
        raise RuntimeError("Set PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET; see .env.example.")
    if not base_url.startswith("https://") and base_url not in {
        "http://127.0.0.1",
        "http://localhost",
    }:
        raise RuntimeError("PLUGGY_BASE_URL must use HTTPS outside loopback development.")
    return PluggySettings(client_id=client_id, client_secret=client_secret, base_url=base_url)
