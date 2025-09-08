from __future__ import annotations

import time
from typing import Dict, Any

import requests


FX_URL = "https://api.exchangerate.host/latest"


def fetch_rates(base: str) -> Dict[str, float]:
    base = (base or "USD").upper()
    try:
        resp = requests.get(FX_URL, params={"base": base}, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if not data or not data.get("rates"):
            return {}
        return {k.upper(): float(v) for k, v in data["rates"].items()}
    except Exception:
        return {}


def ensure_rates(user: Dict[str, Any]) -> Dict[str, float]:
    base = (user.get("base_currency") or "USD").upper()
    ts = user.get("fx_ts") or 0
    rates = user.get("fx_rates") or {}
    now = int(time.time())
    # refresh every 24h
    if not rates or now - ts > 24 * 3600:
        rates = fetch_rates(base)
        if rates:
            user["fx_rates"] = rates
            user["fx_ts"] = now
    return rates

