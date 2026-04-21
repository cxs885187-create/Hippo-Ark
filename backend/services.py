from __future__ import annotations

import json
import re
from typing import Any

import jieba
from sqlalchemy import select
from sqlalchemy.orm import Session

try:
    from .models import Interaction, Subject
    from .prompt_engineering import ASSET_SYSTEM_PROMPT, TRANSCRIPTION_SYSTEM_PROMPT, build_asset_user_prompt
    from .security import create_siliconflow_client, desensitize_pii, humanize_siliconflow_error
except ImportError:
    from models import Interaction, Subject
    from prompt_engineering import ASSET_SYSTEM_PROMPT, TRANSCRIPTION_SYSTEM_PROMPT, build_asset_user_prompt
    from security import create_siliconflow_client, desensitize_pii, humanize_siliconflow_error


TRANSCRIPTION_MODEL = "FunAudioLLM/SenseVoiceSmall"
ASSET_MODEL = "deepseek-ai/DeepSeek-V3"

UTTERANCE_SPLIT_PATTERN = re.compile(r"[。！？!?；;\n]+")


def clean_transcription_text(raw_text: str) -> str:
    text = re.sub(r"<\|.*?\|>", "", raw_text)
    text = re.sub(r"[^\w\s，。！？、：；（）《》“”‘’…-]", "", text)
    return text.strip()


def transcribe_audio(audio_bytes: bytes, filename: str, mime_type: str | None = None) -> tuple[str, bool]:
    if len(audio_bytes) < 5 * 1024:
        raise ValueError("录音时长过短或文件无效，请重新录制。")

    try:
        result = create_siliconflow_client().audio.transcriptions.create(
            model=TRANSCRIPTION_MODEL,
            file=(filename, audio_bytes, mime_type or "application/octet-stream"),
            prompt=TRANSCRIPTION_SYSTEM_PROMPT,
        )
        raw_text = getattr(result, "text", str(result)).strip()
        clean_text = clean_transcription_text(raw_text)
        if not clean_text:
            raise ValueError("未识别到有效语音内容，请重试。")
        return desensitize_pii(clean_text)
    except Exception as exc:
        if isinstance(exc, ValueError):
            raise
        raise RuntimeError(humanize_siliconflow_error(exc)) from exc


def _split_utterances(text: str) -> list[str]:
    return [chunk.strip() for chunk in UTTERANCE_SPLIT_PATTERN.split(text) if chunk.strip()]


def calculate_nlp_metrics(text: str) -> dict[str, Any]:
    if not text or not text.strip():
        return {"mlu": 0.0, "ttr": 0.0, "total_words": 0, "unique_words": 0}

    clean_text = re.sub(r"[^\w\s]", "", text)
    words = [word for word in jieba.cut(clean_text) if word.strip()]
    utterances = _split_utterances(text)
    total_words = len(words)
    unique_words = len(set(words))
    ttr = round(unique_words / total_words, 4) if total_words else 0.0
    mlu = round(sum(len(item) for item in utterances) / len(utterances), 2) if utterances else 0.0
    return {
        "mlu": mlu,
        "ttr": ttr,
        "total_words": total_words,
        "unique_words": unique_words,
    }


def build_subject_metrics(db: Session, subject_id: int) -> dict[str, Any]:
    stmt = (
        select(Interaction)
        .where(
            Interaction.subject_id == subject_id,
            Interaction.speaker == "elder",
            Interaction.status == "transcribed",
            Interaction.transcript.is_not(None),
        )
        .order_by(Interaction.created_at.asc(), Interaction.id.asc())
    )
    records = list(db.scalars(stmt))
    transcripts = [record.transcript or "" for record in records if record.transcript]
    combined_text = "\n".join(transcripts).strip()
    metrics = calculate_nlp_metrics(combined_text)
    activity = [
        {
            "interaction_id": record.id,
            "timestamp": record.created_at.isoformat() if record.created_at else "",
            "label": record.created_at.strftime("%H:%M") if record.created_at else "--:--",
            "characters": len(record.transcript or ""),
        }
        for record in records
    ]
    metrics["transcript_count"] = len(records)
    metrics["total_characters"] = sum(item["characters"] for item in activity)
    metrics["activity"] = activity
    return metrics


def _extract_json_block(raw_output: str) -> str:
    cleaned = raw_output.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()
    if cleaned.startswith("{") and cleaned.endswith("}"):
        return cleaned

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        return cleaned[start : end + 1]
    return cleaned


def _parse_asset_json(raw_output: str) -> dict[str, Any]:
    return json.loads(_extract_json_block(raw_output))


def collect_subject_text(db: Session, subject_id: int, source_interaction_id: int | None = None) -> str:
    if source_interaction_id is not None:
        record = db.get(Interaction, source_interaction_id)
        if not record or record.subject_id != subject_id or not record.transcript:
            return ""
        return record.transcript

    stmt = (
        select(Interaction)
        .where(
            Interaction.subject_id == subject_id,
            Interaction.speaker == "elder",
            Interaction.status == "transcribed",
            Interaction.transcript.is_not(None),
        )
        .order_by(Interaction.created_at.asc(), Interaction.id.asc())
    )
    transcripts = [record.transcript for record in db.scalars(stmt) if record.transcript]
    return "\n".join(transcripts).strip()


def build_family_asset(db: Session, subject_id: int, source_interaction_id: int | None = None) -> dict[str, Any]:
    subject = db.get(Subject, subject_id)
    combined_text = collect_subject_text(db, subject_id, source_interaction_id)
    if not subject or not combined_text:
        raise ValueError("暂无可用于萃取的已转录文本。")

    try:
        response = create_siliconflow_client().chat.completions.create(
            model=ASSET_MODEL,
            temperature=0.2,
            messages=[
                {"role": "system", "content": ASSET_SYSTEM_PROMPT},
                {"role": "user", "content": build_asset_user_prompt(combined_text)},
            ],
        )
        raw_output = response.choices[0].message.content.strip()
        return _parse_asset_json(raw_output)
    except json.JSONDecodeError as exc:
        raise RuntimeError("大模型未严格输出 JSON，暂时无法生成结构化资产。") from exc
    except Exception as exc:
        raise RuntimeError(humanize_siliconflow_error(exc)) from exc
