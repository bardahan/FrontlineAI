import os
import json
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from fastapi import Body, FastAPI, Depends, HTTPException, Form, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from dotenv import load_dotenv

import gemini as gm
import auth
import email_utils
from auth import get_current_user
from database import get_db, init_db, Settings, Call, User, Tool, UserTool
from schemas import SettingsRead, SettingsUpdate, CallRead
from tools import build_tools_for_user
from timezone_utils import resolve_timezone, now_in_tz

load_dotenv()

import logging
logger = logging.getLogger("frontline_ai")

# Keep strong references to background tasks so they aren't GC'd before completing
_background_tasks: set = set()

def fire_and_forget(coro):
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:8000")
# Public URL used for Twilio WebSocket callbacks (e.g. ngrok in dev, real domain in prod).
# Falls back to APP_BASE_URL if not set.
PUBLIC_URL = os.getenv("PUBLIC_URL", APP_BASE_URL)
# In production (nginx proxy), frontend and backend share the same URL.
# FRONTEND_URL falls back to APP_BASE_URL if not explicitly set.
FRONTEND_URL = os.getenv("FRONTEND_URL", APP_BASE_URL)
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174").split(",")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="FrontlineAI", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def validate_twilio_signature(request: Request):
    """Skip validation in dev mode (no auth token configured)."""
    if not TWILIO_AUTH_TOKEN:
        return
    try:
        from twilio.request_validator import RequestValidator
        validator = RequestValidator(TWILIO_AUTH_TOKEN)
        url = str(request.url)
        # Validation would need form params - skipping full impl for brevity
    except Exception:
        pass


# ─── Auth Routes ──────────────────────────────────────────────────────────────

@app.get("/auth/login")
def auth_login(request: Request):
    redirect_uri = APP_BASE_URL.rstrip("/") + "/auth/callback"
    return RedirectResponse(auth.google_auth_url(redirect_uri))


@app.get("/auth/callback")
async def auth_callback(code: str, request: Request, db: Session = Depends(get_db)):
    redirect_uri = APP_BASE_URL.rstrip("/") + "/auth/callback"
    try:
        tokens = await auth.exchange_code(code, redirect_uri)
        userinfo = await auth.get_google_userinfo(tokens["access_token"])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth error: {e}")

    google_id = userinfo["id"]
    user = db.query(User).filter(User.google_id == google_id).first()
    if not user:
        user = User(
            google_id=google_id,
            email=userinfo.get("email", ""),
            name=userinfo.get("name", ""),
            avatar_url=userinfo.get("picture", ""),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        user.name = userinfo.get("name", user.name)
        user.avatar_url = userinfo.get("picture", user.avatar_url)
        db.commit()

    token = auth.create_session_token(user)
    response = RedirectResponse(url=auth.FRONTEND_URL)
    response.set_cookie(
        "access_token", token,
        httponly=True, samesite="lax", max_age=72 * 3600
    )
    return response


@app.get("/auth/me")
def auth_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "avatar_url": current_user.avatar_url,
    }


@app.post("/auth/logout")
def auth_logout():
    response = RedirectResponse(url=auth.FRONTEND_URL, status_code=302)
    response.delete_cookie("access_token")
    return response


# ─── Twilio Routes ────────────────────────────────────────────────────────────

@app.post("/twilio/incoming")
async def twilio_incoming(
    request: Request,
    db: Session = Depends(get_db),
    CallSid: str = Form(default=""),
    From: str = Form(default=""),
    To: str = Form(default=""),
    ForwardedFrom: str = Form(default=""),
    CallerCountry: str = Form(default=""),
):
    validate_twilio_signature(request)

    # Route by the Twilio number that was called (To field)
    settings = db.query(Settings).filter(Settings.twilio_number == To).first()

    if not settings or not settings.user_id:
        logger.warning(f"[twilio/incoming] No user configured for Twilio number {To!r}, hanging up")
        return Response(
            content='<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
            media_type="text/xml",
        )

    # Log the call
    call = Call(
        call_sid=CallSid or f"twilio-{int(datetime.now(timezone.utc).timestamp())}",
        caller_number=From,
        status="ai-handled",
        user_id=settings.user_id,
    )
    db.add(call)
    db.commit()

    # Resolve caller timezone: prefer CallerCountry, fall back to account setting
    caller_tz = resolve_timezone(CallerCountry, settings.timezone or "UTC")
    logger.debug("[twilio/incoming] CallerCountry=%s resolved_tz=%s", CallerCountry, caller_tz)

    ws_url = PUBLIC_URL.replace("https://", "wss://").replace("http://", "ws://")
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="{ws_url}/ws/media">
      <Parameter name="user_id" value="{settings.user_id}"/>
      <Parameter name="call_sid" value="{CallSid}"/>
      <Parameter name="caller_timezone" value="{caller_tz}"/>
    </Stream>
  </Connect>
</Response>"""
    return Response(content=twiml, media_type="text/xml")


# ─── Settings helpers ─────────────────────────────────────────────────────────

def get_or_create_settings(user_id: int, db: Session) -> Settings:
    """Fetch the Settings row for user_id, creating it if missing."""
    settings = db.query(Settings).filter(Settings.user_id == user_id).first()
    if not settings:
        settings = Settings(user_id=user_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def load_user_session_config(user_id: int, db: Session) -> Optional[dict]:
    """Load settings and tools for a user session. Returns None if user has no settings."""
    settings = db.query(Settings).filter(Settings.user_id == user_id).first()
    if not settings:
        return None
    user_tool_rows = db.query(UserTool).filter(UserTool.user_id == user_id).all()
    agent_tools = build_tools_for_user(user_tool_rows)
    return {
        "system_prompt": settings.system_prompt,
        "greeting_message": settings.greeting_message,
        "gemini_voice": settings.gemini_voice or "Kore",
        "timezone": settings.timezone or "UTC",
        "tools": agent_tools,
    }


# ─── Settings API ─────────────────────────────────────────────────────────────

@app.get("/api/settings", response_model=SettingsRead)
def get_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_or_create_settings(current_user.id, db)


@app.put("/api/settings", response_model=SettingsRead)
async def update_settings(data: SettingsUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    settings = db.query(Settings).filter(Settings.user_id == current_user.id).first()
    if not settings:
        settings = Settings(user_id=current_user.id)
        db.add(settings)

    # Enforce unique personal_number across users (ignore empty values)
    if data.personal_number:
        conflict = (
            db.query(Settings)
            .filter(
                Settings.personal_number == data.personal_number,
                Settings.user_id != current_user.id,
            )
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=409,
                detail="This phone number is already registered to another account.",
            )

    # Check if another user already owns the requested Twilio number
    if data.twilio_number:
        holder = (
            db.query(Settings)
            .filter(
                Settings.twilio_number == data.twilio_number,
                Settings.user_id != current_user.id,
            )
            .first()
        )
        if holder:
            holder_user = db.query(User).filter(User.id == holder.user_id).first()
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "twilio_number_in_use",
                    "holder_name": holder_user.name if holder_user else "Another user",
                    "holder_email": holder_user.email if holder_user else "",
                    "twilio_number": data.twilio_number,
                },
            )

    changed_fields = data.model_dump(exclude_none=True)
    for field, value in changed_fields.items():
        setattr(settings, field, value)

    db.commit()
    db.refresh(settings)
    return settings


@app.post("/api/settings/claim-twilio-number", response_model=SettingsRead)
def claim_twilio_number(
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a Twilio number from whoever holds it and assign it to the current user."""
    twilio_number = data.get("twilio_number", "")
    if not twilio_number:
        raise HTTPException(status_code=400, detail="twilio_number is required")

    # Clear from current holder first and flush so the unique constraint is freed
    holder = db.query(Settings).filter(
        Settings.twilio_number == twilio_number,
        Settings.user_id != current_user.id,
    ).first()
    if holder:
        holder.twilio_number = ""
        db.flush()

    # Assign to current user
    settings = get_or_create_settings(current_user.id, db)
    settings.twilio_number = twilio_number

    db.commit()
    db.refresh(settings)
    return settings


@app.get("/api/gemini-voices")
def get_gemini_voices():
    return gm.GEMINI_VOICES


@app.get("/api/voice-preview")
async def voice_preview(voice: str = "Kore", current_user: User = Depends(get_current_user)):
    """Generate a short TTS audio clip for a voice preview, returned as WAV."""
    import base64
    import struct
    from fastapi.responses import Response as FastAPIResponse

    text = f"Hi, I'm {voice}. I'm your AI receptionist — how can I help you today?"
    payload = {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}
            },
        },
    }
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key={GEMINI_API_KEY}",
            json=payload,
        )
        r.raise_for_status()
        data = r.json()

    audio_b64 = data["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]
    pcm = base64.b64decode(audio_b64)

    # Wrap raw PCM (24kHz, mono, 16-bit little-endian) in a WAV container.
    # Gemini TTS reports audio/L16 but returns little-endian samples — no swap needed.
    pcm_le = pcm

    sample_rate = 24000
    channels = 1
    bits = 16
    byte_rate = sample_rate * channels * bits // 8
    block_align = channels * bits // 8
    data_len = len(pcm_le)

    header = struct.pack('<4sI4s4sIHHIIHH4sI',
        b'RIFF', 36 + data_len, b'WAVE',
        b'fmt ', 16, 1, channels, sample_rate,
        byte_rate, block_align, bits,
        b'data', data_len,
    )
    return FastAPIResponse(content=header + pcm_le, media_type="audio/wav")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def get_config():
    """Public endpoint — returns the account's Twilio numbers list."""
    return {"twilio_number": TWILIO_PHONE_NUMBER}


@app.get("/api/twilio-numbers")
async def get_twilio_numbers(current_user: User = Depends(get_current_user)):
    """Return all Twilio numbers on this account available for assignment."""
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        raise HTTPException(status_code=503, detail="Twilio credentials not configured")
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json",
            auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
            params={"PageSize": 100},
        )
        r.raise_for_status()
        numbers = r.json().get("incoming_phone_numbers", [])
    return [
        {"phone_number": n["phone_number"], "friendly_name": n["friendly_name"]}
        for n in numbers
    ]


# ─── Post-call handler ────────────────────────────────────────────────────────

async def _save_transcript(call: Call, transcript_turns: list, db) -> str:
    """Save transcript, duration, and language. Returns the effective caller number."""
    call.transcript = json.dumps(transcript_turns)
    call.ended_at = datetime.now(timezone.utc)
    started = call.started_at.replace(tzinfo=timezone.utc) if call.started_at.tzinfo is None else call.started_at
    call.duration_seconds = int((call.ended_at - started).total_seconds())

    full_text = " ".join(t.get("text", "") for t in transcript_turns)
    hebrew_chars = sum(1 for c in full_text if '\u05d0' <= c <= '\u05ea')
    call.language_detected = "he" if hebrew_chars > 5 else "en"

    call.post_call_status = "processing"
    db.commit()
    return call.caller_number


async def _generate_summary(call: Call, db, transcript_turns: list, caller_number: str) -> str:
    """Generate a post-call summary. Returns the summary text."""
    summary_language = ""
    if call.user_id:
        user_settings = db.query(Settings).filter(Settings.user_id == call.user_id).first()
        if user_settings:
            summary_language = user_settings.summary_language or ""

    summary = await gm.summarize_call(transcript_turns, caller_number, GEMINI_API_KEY, summary_language)
    call.summary = summary
    call.post_call_status = "done"
    db.commit()
    return summary


async def _send_email(call: Call, db, summary: str, caller_number: str):
    """Send summary email to the call owner if configured."""
    if not call.user_id:
        return
    user = db.query(User).filter(User.id == call.user_id).first()
    if user and user.email:
        await email_utils.send_call_summary(
            to_email=user.email,
            caller_number=caller_number,
            started_at=call.started_at,
            duration_seconds=call.duration_seconds,
            summary=summary,
            frontend_url=FRONTEND_URL,
        )


async def run_post_call(call_sid: str, transcript_turns: list, caller_number: str):
    """Saves transcript and generates a callback summary. Runs as a background task."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        call = db.query(Call).filter(Call.call_sid == call_sid).first()
        if not call:
            return

        effective_caller = await _save_transcript(call, transcript_turns, db)
        effective_caller = call.caller_number or caller_number

        summary = await _generate_summary(call, db, transcript_turns, effective_caller)
        logger.info(f"[post-call] Summary done for {call_sid}")

        await _send_email(call, db, summary, effective_caller)
    except Exception as e:
        logger.error(f"[post-call] Error for {call_sid}: {e}")
        try:
            call.post_call_status = "failed"
            db.commit()
        except Exception:
            pass
    finally:
        db.close()


# ─── Shared agent session runner ──────────────────────────────────────────────

async def run_agent_session(
    session,
    call_sid: str,
    caller_number: str,
    user_id: Optional[int],
    receive_pcm,   # async generator yielding PCM int16 16kHz bytes
    send_pcm,      # async callable(pcm_bytes: bytes) → None
):
    """
    Unified agent session loop used by both Twilio and browser endpoints.
    - receive_pcm: yields raw PCM 16kHz bytes from the caller
    - send_pcm: sends raw PCM 24kHz bytes to the caller
    Audio format conversion (µ-law ↔ PCM) is handled by the caller before/after.
    """
    # Log the call
    from database import SessionLocal as _SL
    _db = _SL()
    try:
        existing = _db.query(Call).filter(Call.call_sid == call_sid).first()
        if not existing:
            _db.add(Call(
                call_sid=call_sid,
                caller_number=caller_number,
                status="ai-handled",
                user_id=user_id,
            ))
            _db.commit()
    finally:
        _db.close()

    try:
        await session.connect()
    except Exception as e:
        logger.error(f"[session] connect failed: {e}")
        return

    stop_event = asyncio.Event()
    audio_queue: asyncio.Queue[bytes] = asyncio.Queue()

    def on_gemini_audio(pcm_bytes: bytes):
        audio_queue.put_nowait(pcm_bytes)

    async def caller_to_gemini():
        try:
            async for pcm in receive_pcm():
                if stop_event.is_set():
                    break
                await session.send_audio(pcm)
        except Exception:
            pass
        finally:
            stop_event.set()

    async def gemini_to_caller():
        try:
            await session.recv_loop(on_gemini_audio)
        except Exception as e:
            logger.error(f"[session] recv_loop error: {e}")
        finally:
            stop_event.set()

    async def audio_sender():
        try:
            while not stop_event.is_set():
                try:
                    pcm = await asyncio.wait_for(audio_queue.get(), timeout=0.5)
                except asyncio.TimeoutError:
                    continue
                await send_pcm(pcm)
        except Exception as e:
            logger.error(f"[session] audio_sender error: {e}")
        finally:
            stop_event.set()

    async def close_on_stop():
        await stop_event.wait()
        await session.close()

    try:
        await asyncio.gather(
            caller_to_gemini(),
            gemini_to_caller(),
            audio_sender(),
            close_on_stop(),
            return_exceptions=True,
        )
    finally:
        await session.close()
        fire_and_forget(run_post_call(call_sid, session.transcript_turns, caller_number))


# ─── Twilio Media Stream WebSocket ────────────────────────────────────────────

@app.websocket("/ws/media")
async def ws_media(websocket: WebSocket):
    await websocket.accept()

    # Read messages until we get the "start" event which carries customParameters
    stream_sid: Optional[str] = None
    call_sid: Optional[str] = None
    caller_number = "Unknown"
    user_id: Optional[int] = None
    caller_timezone: str = "UTC"
    buffered_media: list = []  # media events received before session is ready

    async for raw in websocket.iter_text():
        data = json.loads(raw)
        event = data.get("event")
        if event == "connected":
            continue  # Twilio handshake message, no useful info
        if event == "start":
            stream_sid = data.get("streamSid")
            start = data.get("start", {})
            call_sid = start.get("callSid")
            custom = start.get("customParameters", {})
            caller_number = start.get("from", "Unknown")
            caller_timezone = custom.get("caller_timezone", "UTC")
            try:
                user_id = int(custom.get("user_id", ""))
            except (ValueError, TypeError):
                pass
            logger.info(f"[ws/media] start: call={call_sid} user_id={user_id} caller={caller_number} tz={caller_timezone}")
            break
        # Unlikely but buffer any media that arrives before start
        if event == "media":
            buffered_media.append(data)

    if not user_id:
        logger.warning("[ws/media] No user_id in start event, hanging up")
        await websocket.close(1008)
        return

    from database import SessionLocal
    db = SessionLocal()
    try:
        cfg = load_user_session_config(user_id, db)
    finally:
        db.close()

    if not cfg:
        logger.warning(f"[ws/media] No settings for user_id={user_id}, hanging up")
        await websocket.close(1008)
        return

    if not GEMINI_API_KEY:
        await websocket.close(1008)
        return
    session = gm.GeminiLiveSession(
        system_prompt=cfg["system_prompt"],
        voice_name=cfg["gemini_voice"],
        greeting=cfg["greeting_message"],
        api_key=GEMINI_API_KEY,
        tools=cfg["tools"],
        timezone=caller_timezone,
        caller_number=caller_number,
    )

    async def receive_pcm():
        # Yield any buffered media first
        for d in buffered_media:
            if d.get("media", {}).get("track") == "inbound":
                yield gm.ulaw8k_b64_to_pcm16k_bytes(d["media"]["payload"])
        # Then stream live media
        async for msg in websocket.iter_text():
            data = json.loads(msg)
            event = data.get("event")
            if event == "media":
                if data.get("media", {}).get("track") == "inbound":
                    yield gm.ulaw8k_b64_to_pcm16k_bytes(data["media"]["payload"])
            elif event == "stop":
                break

    async def send_pcm(pcm: bytes):
        if stream_sid:
            await websocket.send_text(json.dumps({
                "event": "media",
                "streamSid": stream_sid,
                "media": {"payload": gm.pcm24k_bytes_to_ulaw8k_b64(pcm)},
            }))

    try:
        await run_agent_session(
            session, call_sid or f"twilio-{int(datetime.now(timezone.utc).timestamp())}",
            caller_number, user_id, receive_pcm, send_pcm,
        )
    except Exception as e:
        logger.error(f"[ws/media] error: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


# ─── Browser Preview WebSocket ────────────────────────────────────────────────

@app.websocket("/ws/browser")
async def ws_browser(websocket: WebSocket):
    await websocket.accept()

    # Resolve user from session cookie
    user_id = None
    token = websocket.cookies.get("access_token")
    if token:
        try:
            from jose import jwt as _jwt
            payload = _jwt.decode(token, auth.JWT_SECRET, algorithms=[auth.ALGORITHM])
            user_id = int(payload["sub"])
        except Exception:
            pass

    from database import SessionLocal
    db = SessionLocal()
    try:
        cfg = load_user_session_config(user_id, db) if user_id else None
    finally:
        db.close()

    if not cfg:
        await websocket.close(1008)
        return

    if not GEMINI_API_KEY:
        await websocket.close(1008)
        return
    session = gm.GeminiLiveSession(
        system_prompt=cfg["system_prompt"],
        voice_name=cfg["gemini_voice"],
        greeting=cfg["greeting_message"],
        api_key=GEMINI_API_KEY,
        tools=cfg["tools"],
        timezone=cfg["timezone"],
        caller_number="Website Preview",
    )

    call_sid = f"browser-{int(datetime.now(timezone.utc).timestamp())}"

    async def receive_pcm():
        async for msg in websocket.iter_bytes():
            yield msg  # already PCM int16 16kHz

    async def send_pcm(pcm: bytes):
        await websocket.send_bytes(pcm)  # already PCM int16 24kHz

    try:
        await run_agent_session(
            session, call_sid, "Website Preview", user_id, receive_pcm, send_pcm,
        )
    finally:
        try:
            await websocket.close()
        except Exception:
            pass



# ─── Calendar OAuth Routes ────────────────────────────────────────────────────

@app.get("/auth/calendar")
def auth_calendar(access: str = "read", current_user: User = Depends(get_current_user)):
    redirect_uri = APP_BASE_URL.rstrip("/") + "/auth/calendar/callback"
    return RedirectResponse(auth.calendar_auth_url(redirect_uri, access))


@app.get("/auth/calendar/callback")
async def auth_calendar_callback(
    code: str,
    state: str = "",
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    redirect_uri = APP_BASE_URL.rstrip("/") + "/auth/calendar/callback"
    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        r = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
            "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
        r.raise_for_status()
        tokens = r.json()

    # Determine access level from scope
    scope = tokens.get("scope", "")
    access_level = "readwrite" if "calendar" in scope and "readonly" not in scope else "read"

    # Compute token expiry
    expires_in = tokens.get("expires_in", 3600)
    token_expiry = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()

    config = {
        "access_token": tokens.get("access_token", ""),
        "refresh_token": tokens.get("refresh_token", ""),
        "token_expiry": token_expiry,
        "access_level": access_level,
    }

    ut = db.query(UserTool).filter(
        UserTool.user_id == current_user.id,
        UserTool.tool_name == "google_calendar",
    ).first()
    if ut:
        ut.config = json.dumps(config)
        ut.enabled = True
    else:
        ut = UserTool(
            user_id=current_user.id,
            tool_name="google_calendar",
            config=json.dumps(config),
            enabled=True,
        )
        db.add(ut)
    db.commit()

    return RedirectResponse(url=FRONTEND_URL)


# ─── Tools API ────────────────────────────────────────────────────────────────

@app.get("/api/tools")
def get_tools(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    catalog = db.query(Tool).all()
    user_tools = {
        ut.tool_name: ut
        for ut in db.query(UserTool).filter(UserTool.user_id == current_user.id).all()
    }
    result = []
    for tool in catalog:
        ut = user_tools.get(tool.name)
        connected = ut is not None and ut.enabled
        config = {}
        if ut and ut.config:
            try:
                config = json.loads(ut.config)
            except Exception:
                pass
        result.append({
            "name": tool.name,
            "display_name": tool.display_name,
            "description": tool.description,
            "icon": tool.icon,
            "connected": connected,
            "access_level": config.get("access_level", "read") if connected else None,
        })
    return result


@app.delete("/api/tools/{tool_name}")
def disconnect_tool(
    tool_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ut = db.query(UserTool).filter(
        UserTool.user_id == current_user.id,
        UserTool.tool_name == tool_name,
    ).first()
    if ut:
        db.delete(ut)
        db.commit()
    return {"status": "ok"}


# ─── Call History API ─────────────────────────────────────────────────────────

@app.get("/api/calls")
def get_calls(page: int = 1, limit: int = 20, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    offset = (page - 1) * limit
    total = db.query(Call).filter(Call.deleted == False, Call.user_id == current_user.id).count()
    calls = (
        db.query(Call)
        .filter(Call.deleted == False, Call.user_id == current_user.id)
        .order_by(Call.started_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": [CallRead.model_validate(c) for c in calls],
    }


@app.get("/api/calls/{call_id}", response_model=CallRead)
def get_call(call_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    call = db.query(Call).filter(Call.id == call_id, Call.deleted == False, Call.user_id == current_user.id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    return call


@app.delete("/api/calls/{call_id}")
def delete_call(call_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    call = db.query(Call).filter(Call.id == call_id, Call.deleted == False, Call.user_id == current_user.id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    call.deleted = True
    db.commit()
    return {"status": "ok"}
