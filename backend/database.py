import os
from datetime import datetime, timezone

from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, sessionmaker, relationship

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL environment variable is not set. "
        "Set it to a PostgreSQL connection string, e.g.: "
        "postgresql://user:password@host:5432/dbname"
    )

# PostgreSQL doesn't need check_same_thread; use connection pooling defaults
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    google_id = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, default="")
    avatar_url = Column(String, default="")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    settings = relationship("Settings", back_populates="user", uselist=False)
    calls = relationship("Call", back_populates="user")
    user_tools = relationship("UserTool", back_populates="user")


class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    personal_number = Column(String, default="", index=True)
    timeout_seconds = Column(Integer, default=15)
    system_prompt = Column(Text, default="You are a helpful receptionist assistant. Greet callers warmly, take clear messages, and answer basic questions about the business. Be concise, professional, and friendly.")
    greeting_message = Column(Text, default="Hi, you've reached the assistant. How can I help you today?")
    gemini_voice = Column(String, default="Kore")
    twilio_number = Column(String, default="", index=True)
    summary_language = Column(String, default="English")  # e.g. "English" — translate summaries to this language; empty = no translation
    timezone = Column(String, default="UTC", server_default="UTC")  # IANA timezone, e.g. "Asia/Jerusalem" — used as fallback when CallerCountry is ambiguous
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    user = relationship("User", back_populates="settings")


class Call(Base):
    __tablename__ = "calls"

    id = Column(Integer, primary_key=True, autoincrement=True)
    call_sid = Column(String, unique=True, index=True)
    caller_number = Column(String, default="")
    started_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    ended_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    transcript = Column(Text, nullable=True)
    language_detected = Column(String, default="unknown")
    status = Column(String, default="ai-handled")
    deleted = Column(Boolean, default=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    summary = Column(Text, nullable=True)
    post_call_status = Column(String, default="pending")

    user = relationship("User", back_populates="calls")


class Tool(Base):
    __tablename__ = "tools"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False, index=True)
    display_name = Column(String, nullable=False)
    description = Column(String, default="")
    icon = Column(String, default="")


class UserTool(Base):
    __tablename__ = "user_tools"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    tool_name = Column(String, nullable=False)
    config = Column(Text, default="{}")
    enabled = Column(Boolean, default=True)

    __table_args__ = (UniqueConstraint("user_id", "tool_name"),)

    user = relationship("User", back_populates="user_tools")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables if they don't exist. Alembic handles migrations."""
    Base.metadata.create_all(bind=engine)
    # Seed tool catalog
    db = SessionLocal()
    try:
        if not db.query(Tool).filter(Tool.name == "google_calendar").first():
            db.add(Tool(
                name="google_calendar",
                display_name="Google Calendar",
                description="Check availability and manage events",
                icon="calendar",
            ))
            db.commit()
    finally:
        db.close()
