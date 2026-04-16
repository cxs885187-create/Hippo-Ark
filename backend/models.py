from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, LargeBinary, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

try:
    from .database import Base
except ImportError:
    from database import Base


class Researcher(Base):
    __tablename__ = "researchers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    interactions: Mapped[list["Interaction"]] = relationship(
        back_populates="subject",
        cascade="all, delete-orphan",
    )
    assets: Mapped[list["AssetSnapshot"]] = relationship(
        back_populates="subject",
        cascade="all, delete-orphan",
    )


class Interaction(Base):
    __tablename__ = "interactions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
    speaker: Mapped[str] = mapped_column(String(16))
    kind: Mapped[str] = mapped_column(String(32), default="message")
    status: Mapped[str] = mapped_column(String(32), default="completed")
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    audio_mime: Mapped[str | None] = mapped_column(String(64), nullable=True)
    audio_filename: Mapped[str | None] = mapped_column(String(128), nullable=True)
    redaction_hit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source_interaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("interactions.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    subject: Mapped[Subject] = relationship(back_populates="interactions")


class AssetSnapshot(Base):
    __tablename__ = "asset_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
    source_interaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("interactions.id", ondelete="SET NULL"),
        nullable=True,
    )
    payload_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    subject: Mapped[Subject] = relationship(back_populates="assets")
