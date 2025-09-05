from __future__ import annotations

import secrets
import uuid
from datetime import datetime


def build_headers() -> dict[str, str]:
    """Create ZipRecruiter headers with randomized identifiers.

    The ZipRecruiter API is fronted by Cloudflare's WAF. Reusing
    identifiers such as the ``vid`` token can quickly lead to requests
    being blocked with ``forbidden cf-waf`` responses. Generating a fresh
    random token for each session helps mimic legitimate mobile clients
    and reduces the chance of triggering Cloudflare defenses.
    """

    # ``vid`` has historically been a random URL safe string. Generate a
    # new one for every session to appear as a unique device.
    vid = secrets.token_urlsafe(8)

    return {
        "Host": "api.ziprecruiter.com",
        "accept": "*/*",
        "x-zr-zva-override": f"100000000;vid:{vid}",
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

