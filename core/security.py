import html
import os
import re
from pathlib import Path

ELDER_NAME_PATTERN = re.compile(r"^[A-Za-z0-9\u4e00-\u9fff_\-]{1,50}$")


def _read_env_file_value(key: str) -> str:
    """Read a key from project-level .env without extra dependencies."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return ""

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        current_key, value = line.split("=", 1)
        if current_key.strip() != key:
            continue
        cleaned = value.strip().strip('"').strip("'")
        return cleaned
    return ""


def get_api_key() -> str:
    """Read SiliconFlow API key from environment."""
    api_key = os.getenv("SILICONFLOW_API_KEY", "").strip()
    if not api_key:
        api_key = _read_env_file_value("SILICONFLOW_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Missing SILICONFLOW_API_KEY. "
            "Please set it in environment variables or project .env."
        )
    return api_key


def safe_html(text) -> str:
    """Escape dynamic text before inserting into unsafe HTML blocks."""
    return html.escape(str(text), quote=True)


def sanitize_elder_name(name: str) -> str:
    """
    Validate elder identifier with a strict allowlist.
    Rejects path traversal and unsupported characters.
    """
    normalized = str(name).strip()
    if not ELDER_NAME_PATTERN.fullmatch(normalized):
        raise ValueError("老人名称不合法：仅允许中英文、数字、下划线和短横线（1-50位）。")
    return normalized
