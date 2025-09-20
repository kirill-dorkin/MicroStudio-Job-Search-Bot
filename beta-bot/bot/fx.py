
from __future__ import annotations

import logging
import time
from typing import Any, Dict

import requests


logger = logging.getLogger(__name__)

FX_URL = "https://api.exchangerate.host/latest"


class FxFetchError(RuntimeError):
    """Raised when an FX rate request fails."""


def fetch_rates(base: str) -> Dict[str, float]:
    base = (base or "USD").upper()
    try:
        resp = requests.get(FX_URL, params={"base": base}, timeout=10)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("fx: request failed for %s: %s", base, exc)
        raise FxFetchError("Не удалось получить курсы валют. Попробуйте позже.") from exc
    try:
        data = resp.json()
    except ValueError as exc:
        logger.warning("fx: invalid JSON for %s: %s", base, exc)
        raise FxFetchError("API курсов валют вернуло некорректный ответ.") from exc
    rates = data.get("rates") if isinstance(data, dict) else None
    if not isinstance(rates, dict) or not rates:
        raise FxFetchError("API не вернуло доступные курсы валют.")
    try:
        return {k.upper(): float(v) for k, v in rates.items()}
    except (TypeError, ValueError) as exc:
        logger.warning("fx: failed to normalize rates for %s: %s", base, exc)
        raise FxFetchError("Получены некорректные значения курсов валют.") from exc


def ensure_rates(user: Dict[str, Any]) -> Dict[str, float]:
    base = (user.get("base_currency") or "USD").upper()
    ts = user.get("fx_ts") or 0
    rates = user.get("fx_rates") or {}
    now = int(time.time())
    # refresh every 24h
    if not rates or now - ts > 24 * 3600:
        try:
            rates = fetch_rates(base)
        except FxFetchError as exc:
            logger.warning("fx: refresh failed for %s: %s", base, exc)
            user.setdefault("fx_rates", {})
            user["fx_error"] = str(exc)
            return user.get("fx_rates") or {}
        user["fx_rates"] = rates
        user["fx_ts"] = now
        user.pop("fx_error", None)
    return user.get("fx_rates") or {}
