import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

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

    parsed = urlparse(base_url)
    https = parsed.scheme == "https" and bool(parsed.netloc)
    loopback_http = parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}
    if not (https or loopback_http) or parsed.username or parsed.password:
        raise RuntimeError("PLUGGY_BASE_URL must use HTTPS outside loopback development.")

    return PluggySettings(client_id=client_id, client_secret=client_secret, base_url=base_url)


DEFAULT_COPILOT_MODELS = {"ollama": "llama3.1:8b", "anthropic": "claude-opus-5-5"}


@dataclass(frozen=True, slots=True)
class CopilotSettings:
    provider: str
    model: str
    # Ollama only.
    base_url: str = ""
    # Anthropic only.
    api_key: str = ""

    @property
    def local(self) -> bool:
        """True when questions and data stay on this machine."""
        return self.provider == "ollama" and urlparse(self.base_url).hostname in {
            "127.0.0.1",
            "localhost",
            "::1",
        }


def copilot_settings() -> CopilotSettings:
    """Which model serves the Copilot. Ollama, running locally, is the default."""
    _load_environment()
    provider = os.getenv("COPILOT_PROVIDER", "").strip().lower() or "ollama"
    if provider not in DEFAULT_COPILOT_MODELS:
        raise RuntimeError("COPILOT_PROVIDER must be 'ollama' or 'anthropic'.")
    model = os.getenv("COPILOT_MODEL", "").strip() or DEFAULT_COPILOT_MODELS[provider]

    if provider == "anthropic":
        api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("Set ANTHROPIC_API_KEY; see .env.example.")
        return CopilotSettings(provider=provider, model=model, api_key=api_key)

    base_url = os.getenv("OLLAMA_BASE_URL", "").strip().rstrip("/") or "http://127.0.0.1:11434"
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username:
        raise RuntimeError("OLLAMA_BASE_URL must be an http(s) URL without credentials.")
    return CopilotSettings(provider=provider, model=model, base_url=base_url)
