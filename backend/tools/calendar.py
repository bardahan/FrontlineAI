import json
import logging
from datetime import datetime, timezone, timedelta
from typing import ClassVar, Optional

import httpx

from tools.base import AgentTool

logger = logging.getLogger("frontline_ai.tools.calendar")


def _make_check_calendar_decl():
    return {
        "name": "check_calendar",
        "description": "Check the user's Google Calendar for availability or upcoming events.",
        "parameters": {
            "type": "object",
            "properties": {
                "time_min": {
                    "type": "string",
                    "description": "Start of time range in ISO 8601 format (e.g. 2024-03-14T09:00:00Z)",
                },
                "time_max": {
                    "type": "string",
                    "description": "End of time range in ISO 8601 format (e.g. 2024-03-14T17:00:00Z)",
                },
            },
            "required": ["time_min", "time_max"],
        },
    }


def _make_create_event_decl():
    return {
        "name": "create_event",
        "description": "Create a new event on the user's Google Calendar.",
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "Event title"},
                "start_time": {"type": "string", "description": "Start time in ISO 8601 format"},
                "end_time": {"type": "string", "description": "End time in ISO 8601 format"},
                "description": {"type": "string", "description": "Optional event description"},
                "attendee_email": {"type": "string", "description": "Optional attendee email"},
            },
            "required": ["summary", "start_time", "end_time"],
        },
    }


class CalendarTool(AgentTool):
    name: ClassVar[str] = "google_calendar"

    def __init__(
        self,
        access_token: str,
        refresh_token: str,
        token_expiry: Optional[str],
        access_level: str = "read",
        client_id: str = "",
        client_secret: str = "",
        timezone: str = "UTC",
    ):
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.token_expiry = token_expiry
        self.access_level = access_level
        self.client_id = client_id
        self.client_secret = client_secret
        self.timezone = timezone  # Set at session start by GeminiLiveSession.connect()

    @classmethod
    def from_config(cls, config: dict) -> "CalendarTool":
        import os
        return cls(
            access_token=config.get("access_token", ""),
            refresh_token=config.get("refresh_token", ""),
            token_expiry=config.get("token_expiry"),
            access_level=config.get("access_level", "read"),
            client_id=os.getenv("GOOGLE_CLIENT_ID", ""),
            client_secret=os.getenv("GOOGLE_CLIENT_SECRET", ""),
        )

    @property
    def function_declarations(self) -> list:
        decls = [_make_check_calendar_decl()]
        if self.access_level == "readwrite":
            decls.append(_make_create_event_decl())
        return decls

    @property
    def prompt_contribution(self) -> str:
        if self.access_level == "readwrite":
            return (
                "\n\nYou have access to the user's Google Calendar. "
                "You can check their availability and create events on their behalf. "
                "When a caller asks to schedule a meeting or check availability, use the calendar tools."
            )
        return (
            "\n\nYou have read-only access to the user's Google Calendar. "
            "You can check their availability and tell callers when the user is free. "
            "When a caller asks about availability, use the check_calendar tool."
        )

    async def _get_valid_token(self) -> str:
        """Return a valid access token, refreshing if near expiry."""
        if self.token_expiry:
            try:
                expiry = datetime.fromisoformat(self.token_expiry.replace("Z", "+00:00"))
                remaining = expiry - datetime.now(timezone.utc)
                logger.debug("[calendar] token expires in %s", remaining)
                if remaining < timedelta(minutes=5):
                    logger.info("[calendar] token near expiry, refreshing...")
                    await self._refresh()
            except Exception as e:
                logger.warning("[calendar] error checking token expiry: %s", e)
        return self.access_token

    async def _refresh(self):
        import auth
        try:
            data = await auth.refresh_google_token(self.refresh_token)
            self.access_token = data.get("access_token", self.access_token)
            if "expires_in" in data:
                expiry = datetime.now(timezone.utc) + timedelta(seconds=data["expires_in"])
                self.token_expiry = expiry.isoformat()
            logger.info("[calendar] token refreshed successfully")
        except Exception as e:
            logger.error("[calendar] token refresh FAILED: %s", e)

    async def execute(self, function_name: str, args: dict) -> str:
        logger.debug("[calendar] execute called: function=%s args=%s", function_name, args)
        if not self.access_token:
            logger.error("[calendar] no access token available — is the calendar connected?")
            return "Calendar error: no access token. The user may need to reconnect their Google Calendar."
        token = await self._get_valid_token()
        if not token:
            logger.error("[calendar] no access token available — is the calendar connected?")
            return "Calendar error: no access token. The user may need to reconnect their Google Calendar."
        if function_name == "check_calendar":
            return await self._check_calendar(token, args)
        elif function_name == "create_event":
            return await self._create_event(token, args)
        logger.warning("[calendar] unknown function: %s", function_name)
        return f"Unknown function: {function_name}"

    async def _check_calendar(self, token: str, args: dict) -> str:
        time_min = args.get("time_min", "")
        time_max = args.get("time_max", "")
        logger.debug("[calendar] check_calendar time_min=%s time_max=%s", time_min, time_max)
        url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
        params = {
            "timeMin": time_min,
            "timeMax": time_max,
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": 10,
        }
        async with httpx.AsyncClient() as client:
            r = await client.get(
                url,
                headers={"Authorization": f"Bearer {token}"},
                params=params,
            )
            if r.status_code != 200:
                error_detail = r.text[:300]
                logger.error(
                    "[calendar] check_calendar API error status=%s body=%s",
                    r.status_code, error_detail,
                )
                return f"Calendar API error {r.status_code}: {error_detail}"
            data = r.json()
            events = data.get("items", [])
            logger.debug("[calendar] check_calendar returned %d events", len(events))
            if not events:
                return "No events found in that time range. The user appears to be free."
            lines = []
            for e in events:
                start = e.get("start", {}).get("dateTime") or e.get("start", {}).get("date", "")
                end = e.get("end", {}).get("dateTime") or e.get("end", {}).get("date", "")
                summary = e.get("summary", "Busy")
                lines.append(f"- {summary}: {start} to {end}")
            return "Events found:\n" + "\n".join(lines)

    async def _create_event(self, token: str, args: dict) -> str:
        tz = self.timezone or "UTC"
        body: dict = {
            "summary": args.get("summary", "Meeting"),
            "start": {"dateTime": args.get("start_time"), "timeZone": tz},
            "end": {"dateTime": args.get("end_time"), "timeZone": tz},
        }
        if args.get("description"):
            body["description"] = args["description"]
        if args.get("attendee_email"):
            body["attendees"] = [{"email": args["attendee_email"]}]
        logger.debug("[calendar] create_event body=%s", body)
        url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
        async with httpx.AsyncClient() as client:
            r = await client.post(
                url,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=body,
            )
            if r.status_code not in (200, 201):
                error_detail = r.text[:300]
                logger.error(
                    "[calendar] create_event FAILED status=%s body=%s",
                    r.status_code, error_detail,
                )
                return f"Failed to create event ({r.status_code}): {error_detail}"
            event = r.json()
            logger.info("[calendar] event created: %s", event.get('summary'))
            return f"Event created: {event.get('summary')} at {event.get('start', {}).get('dateTime', '')}"
