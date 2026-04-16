from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

try:
    from .config import DATABASE_URL
except ImportError:
    from config import DATABASE_URL


connect_args = {"check_same_thread": False, "timeout": 30} if DATABASE_URL.startswith("sqlite") else {}
engine_kwargs = {
    "future": True,
    "connect_args": connect_args,
    "pool_pre_ping": True,
}
if not DATABASE_URL.startswith("sqlite"):
    engine_kwargs["pool_recycle"] = 1800

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
