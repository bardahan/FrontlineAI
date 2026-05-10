"""
Timezone utilities for resolving caller timezone from Twilio's CallerCountry.
"""
from datetime import datetime

import pytz


def resolve_timezone(caller_country: str, account_default: str) -> str:
    """
    Map a 2-letter ISO country code to an IANA timezone string.

    - Single-timezone countries (e.g. IL → Asia/Jerusalem) are resolved automatically.
    - Multi-timezone countries (US, RU, CA, AU…) fall back to account_default.
    - Missing/unknown country codes also fall back to account_default.

    Args:
        caller_country: ISO 3166-1 alpha-2 code from Twilio (e.g. "IL", "US").
        account_default: IANA timezone string configured by the account owner.

    Returns:
        A valid IANA timezone string, never None.
    """
    if caller_country:
        zones = pytz.country_timezones.get(caller_country.strip().upper(), [])
        if len(zones) == 1:
            return zones[0]

    return account_default or "UTC"


def now_in_tz(tz_name: str) -> str:
    """
    Return a human-readable current datetime string for the given IANA timezone.
    Example: "Saturday, March 14 2026, 06:08 PM IST"
    """
    try:
        tz = pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        tz = pytz.UTC

    now = datetime.now(tz)
    # %-d is day without leading zero (Linux/mac); %#d on Windows
    try:
        return now.strftime("%A, %B %-d %Y, %I:%M %p %Z")
    except ValueError:
        return now.strftime("%A, %B %d %Y, %I:%M %p %Z")
