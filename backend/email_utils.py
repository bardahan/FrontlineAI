"""
Email notifications for post-call summaries.
Uses SMTP (default: Gmail). Configure via .env:
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
"""

import os
import logging
from datetime import datetime, timezone
from email.message import EmailMessage

import aiosmtplib
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("frontline_ai")

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")


def _is_configured() -> bool:
    return bool(SMTP_USER and SMTP_PASS)


async def send_call_summary(
    to_email: str,
    caller_number: str,
    started_at: datetime,
    duration_seconds: int | None,
    summary: str,
    frontend_url: str = "http://localhost:5174",
) -> None:
    """Send a call summary email. Silently skips if SMTP is not configured."""
    if not _is_configured():
        logger.info("[email] SMTP not configured, skipping email")
        return

    # Format duration
    if duration_seconds:
        mins, secs = divmod(duration_seconds, 60)
        duration_str = f"{mins}m {secs}s" if mins else f"{secs}s"
    else:
        duration_str = "—"

    # Format date/time
    local_time = started_at.strftime("%Y-%m-%d %H:%M UTC") if started_at else "Unknown"

    subject = f"📞 Call summary — {caller_number}"

    body = f"""\
New call summary from your AI receptionist.

Caller:    {caller_number}
Time:      {local_time}
Duration:  {duration_str}

─────────────────────────────
Summary
─────────────────────────────
{summary}

─────────────────────────────
View full call history: {frontend_url}
"""

    msg = EmailMessage()
    msg["From"] = SMTP_USER
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER,
            password=SMTP_PASS,
            start_tls=True,
        )
        logger.info(f"[email] Sent summary to {to_email}")
    except Exception as e:
        logger.error(f"[email] Failed to send to {to_email}: {e}")
