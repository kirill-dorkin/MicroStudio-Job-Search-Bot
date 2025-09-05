from __future__ import annotations

import uuid
from datetime import datetime


def build_headers() -> dict[str, str]:
    """Create ZipRecruiter headers with randomized identifiers."""
    return {
        "Host": "api.ziprecruiter.com",
        "accept": "*/*",
        "x-zr-zva-override": "100000000;vid:ZT1huzm_EQlDTVEc",
        # Random values to look like a fresh mobile client
        "x-pushnotificationid": uuid.uuid4().hex,
        "x-deviceid": str(uuid.uuid4()).upper(),
        "user-agent": "Job Search/91.0 (iPhone; CPU iOS 16_6_1 like Mac OS X)",
        "authorization": "Basic YTBlZjMyZDYtN2I0Yy00MWVkLWEyODMtYTI1NDAzMzI0YTcyOg==",
        "accept-language": "en-US,en;q=0.9",
    }


def get_cookie_data() -> list[tuple[str, str]]:
    """Return session event data with a current timestamp."""
    ts = datetime.utcnow().isoformat()
    return [
        ("event_type", "session"),
        ("logged_in", "false"),
        ("number_of_retry", "1"),
        ("property", "model:iPhone"),
        ("property", "os:iOS"),
        ("property", "locale:en_us"),
        ("property", "app_build_number:4734"),
        ("property", "app_version:91.0"),
        ("property", "manufacturer:Apple"),
        ("property", f"timestamp:{ts}"),
        ("property", "screen_height:852"),
        ("property", "os_version:16.6.1"),
        ("property", "source:install"),
        ("property", "screen_width:393"),
        ("property", "device_model:iPhone 14 Pro"),
        ("property", "brand:Apple"),
    ]

