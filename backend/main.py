from __future__ import annotations

from contextlib import asynccontextmanager
from functools import lru_cache
from io import BytesIO

from fastapi import Cookie, Depends, FastAPI, File, Form, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

try:
    from .config import (
        COOKIE_DOMAIN,
        COOKIE_MAX_AGE,
        COOKIE_NAME,
        COOKIE_SAMESITE,
        COOKIE_SECURE,
        CORS_ORIGINS,
        DATABASE_URL,
        DEFAULT_SUBJECTS,
        IS_PRODUCTION,
        RESEARCHER_PASSWORD,
        RESEARCHER_USERNAME,
    )
    from .database import Base, SessionLocal, engine, get_db
    from .models import AssetSnapshot, Interaction, Researcher, Subject
    from .security import (
        create_session_token,
        decode_session_token,
        hash_password,
        validate_subject_fields,
        verify_password,
    )
    from .services import build_family_asset, build_subject_metrics, transcribe_audio
except ImportError:
    from config import (
        COOKIE_DOMAIN,
        COOKIE_MAX_AGE,
        COOKIE_NAME,
        COOKIE_SAMESITE,
        COOKIE_SECURE,
        CORS_ORIGINS,
        DATABASE_URL,
        DEFAULT_SUBJECTS,
        IS_PRODUCTION,
        RESEARCHER_PASSWORD,
        RESEARCHER_USERNAME,
    )
    from database import Base, SessionLocal, engine, get_db
    from models import AssetSnapshot, Interaction, Researcher, Subject
    from security import (
        create_session_token,
        decode_session_token,
        hash_password,
        validate_subject_fields,
        verify_password,
    )
    from services import build_family_asset, build_subject_metrics, transcribe_audio


class LoginPayload(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class SubjectPayload(BaseModel):
    code: str
    display_name: str


class PromptPayload(BaseModel):
    transcript: str
    speaker: str = "ai"


class TranscriptPayload(BaseModel):
    transcript: str


class AssetPayload(BaseModel):
    source_interaction_id: int | None = None


def subject_to_dict(subject: Subject) -> dict:
    return {
        "id": subject.id,
        "code": subject.code,
        "display_name": subject.display_name,
        "label": f"{subject.code}_{subject.display_name}",
        "is_active": subject.is_active,
        "created_at": subject.created_at.isoformat() if subject.created_at else None,
        "updated_at": subject.updated_at.isoformat() if subject.updated_at else None,
    }


def interaction_to_dict(interaction: Interaction) -> dict:
    return {
        "id": interaction.id,
        "subject_id": interaction.subject_id,
        "speaker": interaction.speaker,
        "kind": interaction.kind,
        "status": interaction.status,
        "transcript": interaction.transcript,
        "redaction_hit": interaction.redaction_hit,
        "created_at": interaction.created_at.isoformat() if interaction.created_at else None,
        "updated_at": interaction.updated_at.isoformat() if interaction.updated_at else None,
        "audio_url": f"/api/interactions/{interaction.id}/audio" if interaction.audio_data else None,
        "source_interaction_id": interaction.source_interaction_id,
    }


def asset_to_dict(asset: AssetSnapshot | None) -> dict | None:
    if asset is None:
        return None
    return {
        "id": asset.id,
        "subject_id": asset.subject_id,
        "source_interaction_id": asset.source_interaction_id,
        "payload_json": asset.payload_json,
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
    }


def seed_defaults(db: Session) -> None:
    if db.scalar(select(Researcher.id).limit(1)) is None:
        db.add(
            Researcher(
                username=RESEARCHER_USERNAME,
                password_hash=hash_password(RESEARCHER_PASSWORD),
            )
        )

    if db.scalar(select(Subject.id).limit(1)) is None:
        for index, item in enumerate(DEFAULT_SUBJECTS):
            db.add(
                Subject(
                    code=item["code"],
                    display_name=item["display_name"],
                    is_active=index == 0,
                )
            )
    db.commit()


def ensure_initialized() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_defaults(db)
    finally:
        db.close()


@lru_cache(maxsize=1)
def ensure_initialized_once() -> None:
    ensure_initialized()


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_initialized_once()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="HippoArk API", version="1.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=512)
    return app


app = create_app()
ensure_initialized_once()


def get_current_researcher(
    session_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
) -> Researcher:
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录实验人员账号。")
    payload = decode_session_token(session_token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录状态已失效。")
    researcher = db.get(Researcher, int(payload["rid"]))
    if researcher is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号不存在。")
    return researcher


def get_subject_or_404(subject_id: int, db: Session) -> Subject:
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=404, detail="未找到对应受试者。")
    return subject


def get_interaction_or_404(interaction_id: int, db: Session) -> Interaction:
    interaction = db.get(Interaction, interaction_id)
    if interaction is None:
        raise HTTPException(status_code=404, detail="未找到对应交互记录。")
    return interaction


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "database": "sqlite" if DATABASE_URL.startswith("sqlite") else "sql",
        "cookie_secure": COOKIE_SECURE,
        "environment": "production" if IS_PRODUCTION else "development",
    }


@app.post("/auth/login")
def login(payload: LoginPayload, response: Response, db: Session = Depends(get_db)) -> dict:
    researcher = db.scalar(select(Researcher).where(Researcher.username == payload.username))
    if researcher is None or not verify_password(payload.password, researcher.password_hash):
        raise HTTPException(status_code=401, detail="账号或密码错误。")

    token = create_session_token(researcher.id, researcher.username)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
        max_age=COOKIE_MAX_AGE,
        path="/",
        domain=COOKIE_DOMAIN or None,
    )
    return {"user": {"id": researcher.id, "username": researcher.username}}


@app.post("/auth/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE_NAME, path="/", domain=COOKIE_DOMAIN or None)
    return {"ok": True}


@app.get("/auth/me")
def me(researcher: Researcher = Depends(get_current_researcher)) -> dict:
    return {"user": {"id": researcher.id, "username": researcher.username}}


@app.get("/subjects")
def list_subjects(
    _: Researcher = Depends(get_current_researcher),
    db: Session = Depends(get_db),
) -> dict:
    subjects = list(db.scalars(select(Subject).order_by(Subject.created_at.asc(), Subject.id.asc())))
    active = next((subject for subject in subjects if subject.is_active), None)
    return {
        "subjects": [subject_to_dict(subject) for subject in subjects],
        "active_subject_id": active.id if active else None,
    }


@app.post("/subjects")
def create_subject(
    payload: SubjectPayload,
    _: Researcher = Depends(get_current_researcher),
    db: Session = Depends(get_db),
) -> dict:
    try:
        code, display_name = validate_subject_fields(payload.code, payload.display_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if db.scalar(select(Subject).where(Subject.code == code)) is not None:
        raise HTTPException(status_code=409, detail="该受试者编号已存在。")

    subject = Subject(code=code, display_name=display_name, is_active=False)
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return {"subject": subject_to_dict(subject)}


@app.patch("/subjects/{subject_id}")
def update_subject(
    subject_id: int,
    payload: SubjectPayload,
    _: Researcher = Depends(get_current_researcher),
    db: Session = Depends(get_db),
) -> dict:
    subject = get_subject_or_404(subject_id, db)
    try:
        code, display_name = validate_subject_fields(payload.code, payload.display_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    existing = db.scalar(select(Subject).where(Subject.code == code, Subject.id != subject_id))
    if existing is not None:
        raise HTTPException(status_code=409, detail="该受试者编号已存在。")

    subject.code = code
    subject.display_name = display_name
    db.commit()
    db.refresh(subject)
    return {"subject": subject_to_dict(subject)}


@app.delete("/subjects/{subject_id}")
def delete_subject(
    subject_id: int,
    _: Researcher = Depends(get_current_researcher),
    db: Session = Depends(get_db),
) -> dict:
    subject = get_subject_or_404(subject_id, db)
    subjects = list(db.scalars(select(Subject).order_by(Subject.id.asc())))
    if len(subjects) <= 1:
        raise HTTPException(status_code=400, detail="至少保留一位受试者。")

    was_active = subject.is_active
    db.delete(subject)
    db.commit()

    if was_active:
        fallback = db.scalar(select(Subject).order_by(Subject.id.asc()))
        if fallback is not None:
            db.execute(update(Subject).values(is_active=False))
            fallback.is_active = True
            db.commit()

    return {"ok": True}


@app.post("/subjects/{subject_id}/activate")
def activate_subject(
    subject_id: int,
    _: Researcher = Depends(get_current_researcher),
    db: Session = Depends(get_db),
) -> dict:
    subject = get_subject_or_404(subject_id, db)
    db.execute(update(Subject).values(is_active=False))
    subject.is_active = True
    db.commit()
    db.refresh(subject)
    return {"subject": subject_to_dict(subject)}


@app.get("/subjects/active")
def get_active_subject(db: Session = Depends(get_db)) -> dict:
    subject = db.scalar(select(Subject).where(Subject.is_active.is_(True)))
    if subject is None:
        raise HTTPException(status_code=404, detail="当前没有激活的受试者。")
    return {"subject": subject_to_dict(subject)}


@app.get("/subjects/{subject_id}/feed")
def get_subject_feed(subject_id: int, limit: int = 30, db: Session = Depends(get_db)) -> dict:
    get_subject_or_404(subject_id, db)
    stmt = (
        select(Interaction)
        .where(Interaction.subject_id == subject_id)
        .order_by(Interaction.created_at.desc(), Interaction.id.desc())
        .limit(max(1, min(limit, 100)))
    )
    items = list(db.scalars(stmt))
    return {"items": [interaction_to_dict(item) for item in items]}


@app.post("/subjects/{subject_id}/recordings")
async def create_recording(
    subject_id: int,
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict:
    subject = get_subject_or_404(subject_id, db)
    audio_bytes = await audio.read()
    interaction = Interaction(
        subject_id=subject.id,
        speaker="elder",
        kind="recording",
        status="pending",
        audio_data=audio_bytes,
        audio_mime=audio.content_type,
        audio_filename=audio.filename or "recording.webm",
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)

    try:
        transcript, redaction_hit = transcribe_audio(
            audio_bytes=audio_bytes,
            filename=interaction.audio_filename or "recording.webm",
            mime_type=interaction.audio_mime,
        )
        interaction.status = "transcribed"
        interaction.transcript = transcript
        interaction.redaction_hit = redaction_hit
    except Exception as exc:
        interaction.status = "error"
        interaction.transcript = str(exc)

    db.commit()
    db.refresh(interaction)
    return {"item": interaction_to_dict(interaction)}


@app.post("/subjects/{subject_id}/prompts")
def create_prompt(
    subject_id: int,
    payload: PromptPayload,
    _: Researcher = Depends(get_current_researcher),
    db: Session = Depends(get_db),
) -> dict:
    subject = get_subject_or_404(subject_id, db)
    speaker = payload.speaker if payload.speaker in {"ai", "system"} else "ai"
    interaction = Interaction(
        subject_id=subject.id,
        speaker=speaker,
        kind="prompt",
        status="replied",
        transcript=payload.transcript.strip(),
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return {"item": interaction_to_dict(interaction)}


@app.patch("/interactions/{interaction_id}/transcript")
def update_transcript(
    interaction_id: int,
    payload: TranscriptPayload,
    _: Researcher = Depends(get_current_researcher),
    db: Session = Depends(get_db),
) -> dict:
    interaction = get_interaction_or_404(interaction_id, db)
    interaction.transcript = payload.transcript.strip()
    interaction.status = "transcribed"
    db.commit()
    db.refresh(interaction)
    return {"item": interaction_to_dict(interaction)}


@app.post("/interactions/{interaction_id}/override-recording")
async def override_recording(
    interaction_id: int,
    audio: UploadFile = File(...),
    _: Researcher = Depends(get_current_researcher),
    db: Session = Depends(get_db),
) -> dict:
    interaction = get_interaction_or_404(interaction_id, db)
    audio_bytes = await audio.read()
    try:
        transcript, redaction_hit = transcribe_audio(
            audio_bytes=audio_bytes,
            filename=audio.filename or "override.webm",
            mime_type=audio.content_type,
        )
        interaction.transcript = transcript
        interaction.status = "transcribed"
        interaction.redaction_hit = redaction_hit
        interaction.audio_data = audio_bytes
        interaction.audio_mime = audio.content_type
        interaction.audio_filename = audio.filename or "override.webm"
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.commit()
    db.refresh(interaction)
    return {"item": interaction_to_dict(interaction)}


@app.post("/subjects/{subject_id}/system-events")
def create_system_event(
    subject_id: int,
    transcript: str = Form(...),
    _: Researcher = Depends(get_current_researcher),
    db: Session = Depends(get_db),
) -> dict:
    subject = get_subject_or_404(subject_id, db)
    interaction = Interaction(
        subject_id=subject.id,
        speaker="system",
        kind="status",
        status="halted",
        transcript=transcript.strip(),
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return {"item": interaction_to_dict(interaction)}


@app.post("/subjects/{subject_id}/requests/topic-switch")
def request_topic_switch(subject_id: int, db: Session = Depends(get_db)) -> dict:
    subject = get_subject_or_404(subject_id, db)
    interaction = Interaction(
        subject_id=subject.id,
        speaker="system",
        kind="status",
        status="replied",
        transcript="【系统提醒】长者主动请求切换话题。",
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return {"item": interaction_to_dict(interaction)}


@app.post("/subjects/{subject_id}/requests/halt")
def request_halt(subject_id: int, db: Session = Depends(get_db)) -> dict:
    subject = get_subject_or_404(subject_id, db)
    interaction = Interaction(
        subject_id=subject.id,
        speaker="system",
        kind="status",
        status="halted",
        transcript="【熔断触发】本次访谈已由长者端主动暂停。",
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return {"item": interaction_to_dict(interaction)}


@app.get("/subjects/{subject_id}/metrics")
def get_metrics(subject_id: int, db: Session = Depends(get_db)) -> dict:
    get_subject_or_404(subject_id, db)
    metrics = build_subject_metrics(db, subject_id)
    return {"metrics": {key: value for key, value in metrics.items() if key != "activity"}}


@app.get("/subjects/{subject_id}/activity-series")
def get_activity_series(subject_id: int, db: Session = Depends(get_db)) -> dict:
    get_subject_or_404(subject_id, db)
    metrics = build_subject_metrics(db, subject_id)
    return {"items": metrics["activity"]}


@app.post("/subjects/{subject_id}/assets/generate")
def generate_asset(
    subject_id: int,
    payload: AssetPayload,
    db: Session = Depends(get_db),
) -> dict:
    get_subject_or_404(subject_id, db)
    try:
        asset_json = build_family_asset(db, subject_id, payload.source_interaction_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    asset = AssetSnapshot(
        subject_id=subject_id,
        source_interaction_id=payload.source_interaction_id,
        payload_json=asset_json,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return {"asset": asset_to_dict(asset)}


@app.get("/subjects/{subject_id}/assets/latest")
def get_latest_asset(subject_id: int, db: Session = Depends(get_db)) -> dict:
    get_subject_or_404(subject_id, db)
    asset = db.scalar(
        select(AssetSnapshot)
        .where(AssetSnapshot.subject_id == subject_id)
        .order_by(AssetSnapshot.created_at.desc(), AssetSnapshot.id.desc())
    )
    return {"asset": asset_to_dict(asset)}


@app.get("/interactions/{interaction_id}/audio")
def get_audio(interaction_id: int, db: Session = Depends(get_db)) -> StreamingResponse:
    interaction = get_interaction_or_404(interaction_id, db)
    if not interaction.audio_data:
        raise HTTPException(status_code=404, detail="该交互没有音频。")
    return StreamingResponse(
        BytesIO(interaction.audio_data),
        media_type=interaction.audio_mime or "audio/webm",
        headers={"Content-Disposition": f'inline; filename="{interaction.audio_filename or "recording.webm"}"'},
    )
