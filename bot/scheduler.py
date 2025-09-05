from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .storage import list_users, get_user, update_user
from .jobs import search_jobs


FREQ_TO_SECONDS = {
    "daily": 24 * 3600,
    "3d": 3 * 24 * 3600,
    "weekly": 7 * 24 * 3600,
}


def _now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def _digest_controls(idx: int, lang: str, subs) -> Any:
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    paused = subs.get("paused") is True
    freq = subs.get("freq") or "off"
    from .texts import label
    row1 = [
        InlineKeyboardButton((label(lang, "pause") if not paused else label(lang, "resume")), callback_data=f"dg:toggle:{idx}")
    ]
    row2 = [
        InlineKeyboardButton(label(lang, "off"), callback_data=f"dg:freq:{idx}:off"),
        InlineKeyboardButton(label(lang, "daily"), callback_data=f"dg:freq:{idx}:daily"),
        InlineKeyboardButton(label(lang, "every_3d"), callback_data=f"dg:freq:{idx}:3d"),
        InlineKeyboardButton(label(lang, "weekly"), callback_data=f"dg:freq:{idx}:weekly"),
    ]
    row3 = [InlineKeyboardButton(label(lang, "send_now"), callback_data=f"dg:digest:{idx}")]
    return InlineKeyboardMarkup([row1, row2, row3])


async def _send_digest(app, uid: int):
    user = get_user(uid)
    saved = user.get("saved_searches") or []
    if not saved:
        return
    lang = (user.get("lang") or "ru")
    sources = user.get("sources") or []
    country = user.get("country_indeed") or "usa"
    # Iterate per saved search frequency (fallback to user-level)
    user_subs = user.get("subs") or {}
    user_freq = user_subs.get("freq") or "daily"
    sent_any = False
    for idx, s in enumerate(saved):
        subs = s.get("subs") or {}
        freq = subs.get("freq") or user_freq
        paused = subs.get("paused") is True
        last_ts = subs.get("last_ts") or 0
        period_sec = FREQ_TO_SECONDS.get(freq, 24 * 3600)
        if paused or _now_ts() - last_ts < period_sec:
            continue
        filters = dict(s.get("filters") or {})
        # Use hours_old based on period
        hours_old = int((period_sec // 3600) or 24)
        filters.setdefault("hours_old", hours_old)
        try:
            rows, _ = search_jobs(filters, sources, country, results_wanted=15, offset=0)
        except Exception:
            rows = []
        if not rows:
            # update last_ts to avoid spamming
            saved[idx]["subs"] = {"freq": freq, "last_ts": _now_ts(), "paused": paused}
            continue
        if not sent_any:
            from .texts import t
            await app.bot.send_message(uid, t(lang, "digest_header"))
            sent_any = True
        await app.bot.send_message(uid, f"• {s.get('name')}", reply_markup=_digest_controls(idx, lang, subs))
        for j in rows[:5]:
            txt = f"{j.get('title')} — {j.get('company')} • {j.get('location')}\n{j.get('job_url')}"
            await app.bot.send_message(uid, txt, disable_web_page_preview=True)
        saved[idx]["subs"] = {"freq": freq, "last_ts": _now_ts(), "paused": paused}
    if sent_any:
        # persist last_ts updates in saved_searches
        user["saved_searches"] = saved
        update_user(uid, user)


def start_scheduler(app) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()

    async def tick():
        for uid in list_users():
            try:
                await _send_digest(app, uid)
            except Exception:
                continue

    # run every 30 minutes to check if a digest is due
    scheduler.add_job(lambda: app.create_task(tick()), "interval", minutes=30, id="digest")
    scheduler.start()
    return scheduler
