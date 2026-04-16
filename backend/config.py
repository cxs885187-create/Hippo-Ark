from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
IS_VERCEL = os.getenv("VERCEL", "").strip() == "1"
APP_ENV = os.getenv("APP_ENV", "production" if IS_VERCEL else "development").strip().lower() or "development"
IS_PRODUCTION = APP_ENV == "production"


@lru_cache(maxsize=1)
def _env_file_values() -> dict[str, str]:
    env_path = ROOT_DIR / ".env"
    if not env_path.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def get_env(key: str, default: str = "") -> str:
    value = os.getenv(key, "").strip()
    if value:
        return value
    return _env_file_values().get(key, default)


def get_bool_env(key: str, default: bool) -> bool:
    raw = get_env(key, str(default)).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def parse_csv_env(key: str, default: list[str] | None = None) -> list[str]:
    raw = get_env(key, "")
    if not raw:
        return list(default or [])
    return [item.strip() for item in raw.split(",") if item.strip()]


def resolve_data_dir() -> Path:
    configured = get_env("DATA_DIR", "").strip()
    if configured:
        path = Path(configured)
    elif IS_VERCEL:
        path = Path("/tmp/hippoark")
    else:
        path = ROOT_DIR / "data"
    path.mkdir(parents=True, exist_ok=True)
    return path


DATA_DIR = resolve_data_dir()
DEFAULT_SQLITE_PATH = DATA_DIR / "hippoark_site.db"
DATABASE_URL = get_env("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}")
APP_SECRET = get_env("APP_SECRET", "hippoark-local-secret")
SILICONFLOW_API_KEY = get_env("SILICONFLOW_API_KEY")
SILICONFLOW_BASE_URL = get_env("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1")
RESEARCHER_USERNAME = get_env("RESEARCHER_USERNAME", "researcher")
RESEARCHER_PASSWORD = get_env("RESEARCHER_PASSWORD", "hippoark2026")
COOKIE_NAME = get_env("COOKIE_NAME", "hippoark_research")
COOKIE_MAX_AGE = int(get_env("COOKIE_MAX_AGE", str(60 * 60 * 24)))
COOKIE_SECURE = get_bool_env("COOKIE_SECURE", IS_PRODUCTION or IS_VERCEL)
COOKIE_SAMESITE = get_env("COOKIE_SAMESITE", "lax").lower() or "lax"
COOKIE_DOMAIN = get_env("COOKIE_DOMAIN", "")

DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8501",
    "http://localhost:8502",
    "http://localhost:8503",
]

vercel_url = get_env("VERCEL_URL", "")
if vercel_url:
    DEFAULT_CORS_ORIGINS.append(f"https://{vercel_url}")

CORS_ORIGINS = parse_csv_env("CORS_ORIGINS", DEFAULT_CORS_ORIGINS)

DEFAULT_SUBJECTS = [
    {"code": "P01", "display_name": "王奶奶"},
    {"code": "P02", "display_name": "李大爷"},
    {"code": "P03", "display_name": "陈阿婆"},
    {"code": "P04", "display_name": "张阿公"},
]
