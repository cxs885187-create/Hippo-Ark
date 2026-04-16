from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any

import httpx
from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI

try:
    from .config import APP_SECRET, COOKIE_MAX_AGE, SILICONFLOW_API_KEY, SILICONFLOW_BASE_URL
except ImportError:
    from config import APP_SECRET, COOKIE_MAX_AGE, SILICONFLOW_API_KEY, SILICONFLOW_BASE_URL


SUBJECT_CODE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
DISPLAY_NAME_PATTERN = re.compile(r"^[A-Za-z0-9\u4e00-\u9fff_-]{1,64}$")


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 150_000)
    return f"{salt.hex()}${derived.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    salt_hex, digest_hex = password_hash.split("$", 1)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt_hex),
        150_000,
    )
    return hmac.compare_digest(derived.hex(), digest_hex)


def _sign(data: bytes) -> str:
    signature = hmac.new(APP_SECRET.encode("utf-8"), data, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")


def create_session_token(researcher_id: int, username: str) -> str:
    expires_at = int((datetime.now(UTC) + timedelta(seconds=COOKIE_MAX_AGE)).timestamp())
    payload = {"rid": researcher_id, "username": username, "exp": expires_at}
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    encoded = base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")
    return f"{encoded}.{_sign(raw)}"


def decode_session_token(token: str) -> dict[str, Any] | None:
    try:
        encoded, signature = token.split(".", 1)
        raw = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
    except Exception:
        return None

    if not hmac.compare_digest(signature, _sign(raw)):
        return None

    try:
        payload = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
        return None

    if int(payload.get("exp", 0)) < int(datetime.now(UTC).timestamp()):
        return None
    return payload


def validate_subject_fields(code: str, display_name: str) -> tuple[str, str]:
    normalized_code = code.strip()
    normalized_name = display_name.strip()
    if not SUBJECT_CODE_PATTERN.fullmatch(normalized_code):
        raise ValueError("受试者编号仅允许英文、数字、下划线和短横线，长度为 1 到 32 位。")
    if not DISPLAY_NAME_PATTERN.fullmatch(normalized_name):
        raise ValueError("受试者名称仅允许中英文、数字、下划线和短横线，长度为 1 到 64 位。")
    return normalized_code, normalized_name


@lru_cache(maxsize=1)
def create_siliconflow_client() -> OpenAI:
    if not SILICONFLOW_API_KEY:
        raise RuntimeError("缺少 SILICONFLOW_API_KEY")
    http_client = httpx.Client(timeout=httpx.Timeout(120.0, connect=20.0), trust_env=False)
    return OpenAI(api_key=SILICONFLOW_API_KEY, base_url=SILICONFLOW_BASE_URL, http_client=http_client)


def humanize_siliconflow_error(exc: Exception) -> str:
    if isinstance(exc, APIStatusError):
        status_code = exc.status_code
        response_text = ""
        try:
            response_text = exc.response.text or ""
        except Exception:
            response_text = ""
        lowered = response_text.lower()
        if status_code == 401 or "invalid token" in lowered or "unauthorized" in lowered:
            return "SiliconFlow API Key 无效或已过期。"
        if status_code == 403 and ("balance is insufficient" in lowered or '"code":30001' in lowered):
            return "SiliconFlow 账户余额不足，请充值后重试。"
        if status_code == 429:
            return "SiliconFlow 请求过于频繁，请稍后重试。"
        if status_code >= 500:
            return "SiliconFlow 服务暂时不可用，请稍后重试。"
        return f"SiliconFlow 请求失败 (HTTP {status_code})。"
    if isinstance(exc, APITimeoutError):
        return "SiliconFlow 请求超时，请稍后重试。"
    if isinstance(exc, APIConnectionError):
        return "SiliconFlow 网络连接失败，请检查网络环境。"
    return f"SiliconFlow 调用失败：{exc.__class__.__name__}"


def desensitize_pii(text: str) -> tuple[str, bool]:
    original_text = text
    text = re.sub(r"(1[3-9]\d)\d{4}(\d{4})", r"\1****\2", text)
    text = re.sub(r"([1-9]\d{5})\d{8}(\d{4}|\d{3}[Xx])", r"\1********\2", text)
    text = re.sub(
        r"([一二三四五六七八九十百千万\d]+)([号栋室单元楼层弄])",
        r"***\2",
        text,
    )
    return text, text != original_text
