from pydantic import BaseModel, ConfigDict, field_validator
from datetime import datetime
from typing import Optional


class _BaseORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserRead(BaseModel):
    id: int
    email: str
    name: str
    avatar_url: str


class SettingsRead(_BaseORM):
    id: int
    personal_number: str
    timeout_seconds: int
    system_prompt: str
    greeting_message: str
    gemini_voice: str = "Kore"
    twilio_number: str = ""
    summary_language: str = ""
    timezone: str = "UTC"

    @field_validator("timezone", mode="before")
    @classmethod
    def default_timezone(cls, v):
        return v or "UTC"


class SettingsUpdate(BaseModel):
    personal_number: Optional[str] = None
    timeout_seconds: Optional[int] = None
    system_prompt: Optional[str] = None
    greeting_message: Optional[str] = None
    gemini_voice: Optional[str] = None
    twilio_number: Optional[str] = None
    summary_language: Optional[str] = None
    timezone: Optional[str] = None


class CallRead(_BaseORM):
    id: int
    call_sid: str
    caller_number: str
    started_at: datetime
    ended_at: Optional[datetime]
    duration_seconds: Optional[int]
    transcript: Optional[str]
    language_detected: str
    status: str
    summary: Optional[str] = None
    post_call_status: str = "pending"
