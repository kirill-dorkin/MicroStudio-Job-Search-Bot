from __future__ import annotations

import os
import io
import sys
import logging
import tempfile
import hashlib
from typing import Dict, Any, List
from pathlib import Path

from telegram import (
    Update,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    ReplyKeyboardRemove,
    InputFile,
)
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ConversationHandler,
    ContextTypes,
    filters,
)
from telegram.error import Conflict
import warnings
try:
    from telegram.warnings import PTBUserWarning
    warnings.filterwarnings("ignore", category=PTBUserWarning)
except Exception:
    pass

from .texts import t, label
from .storage import (
    get_user,
    update_user,
    save_favorite,
    list_favorites,
    clear_favorites,
    save_search,
    list_saved_searches,
    update_saved_search,
    save_last_results,
    get_last_results,
    export_user,
    delete_user,
)
from .jobs import search_jobs, DEFAULT_SOURCES
from .scheduler import start_scheduler

# Load environment variables from .env files if present
try:
    from dotenv import load_dotenv
    # Load from project root .env (if any)
    load_dotenv()
    # Load from bot/.env specifically (safely no-op if missing)
    load_dotenv(Path(__file__).with_name(".env"))
except Exception:
    # If python-dotenv isn't installed or any error occurs, just continue;
    # build_app() will still require TELEGRAM_BOT_TOKEN in env.
    pass


# ---- Logging ----
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

# Suppress PTB Updater's loud 409 Conflict error log; we handle it gracefully below
class _ConflictFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:  # type: ignore[override]
        try:
            msg = record.getMessage()
        except Exception:
            return True
        if "Error while getting Updates: Conflict" in msg:
            return False
        return True

try:
    logging.getLogger("telegram.ext.Updater").addFilter(_ConflictFilter())
except Exception:
    pass


# ---- Single-instance lock (local) ----
_LOCK_FILE_HANDLE = None

def _ensure_single_instance() -> None:
    """Prevent starting multiple local instances of the bot.
    Uses an advisory file lock in the temp directory keyed by bot token hash.
    """
    global _LOCK_FILE_HANDLE
    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    # Use token hash to scope per-bot lock (avoid leaking token)
    token_hash = hashlib.sha256(token.encode()).hexdigest()[:12] if token else "notoken"
    lock_path = os.path.join(tempfile.gettempdir(), f"microstudio_job_search_bot_{token_hash}.lock")
    try:
        # Open lock file and try to acquire non-blocking exclusive lock (POSIX)
        _LOCK_FILE_HANDLE = open(lock_path, "w")
        try:
            import fcntl  # POSIX only
            fcntl.flock(_LOCK_FILE_HANDLE.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except ModuleNotFoundError:
            # Fallback: best-effort single instance via creating the file exclusively
            if os.path.exists(lock_path):
                raise RuntimeError("Lock file exists")
            _LOCK_FILE_HANDLE.write(str(os.getpid()))
            _LOCK_FILE_HANDLE.flush()
    except Exception:
        print("Another local instance appears to be running. Exiting.")
        sys.exit(1)


# ---- Remote poller preflight ----
def _preflight_conflict_check(token: str) -> bool:
    """Returns True if no other getUpdates poller is active for this token.
    If a 409 Conflict is detected, returns False.
    Uses a lightweight synchronous HTTP call to the Bot API.
    """
    try:
        import httpx
        base = f"https://api.telegram.org/bot{token}"
        # Ensure webhook is removed (safe if already off)
        try:
            httpx.post(f"{base}/deleteWebhook", timeout=3)
        except Exception:
            pass
        # Quick probe for poller conflict
        r = httpx.get(f"{base}/getUpdates", params={"timeout": 0, "limit": 1}, timeout=3)
        if r.status_code == 409:
            # Another long-poll connection is active
            return False
        return True
    except Exception:
        # On network/other errors, don't block startup
        return True


# ---- Quick search parser ----

def parse_quick_query(text: str) -> Dict[str, Any]:
    filters: Dict[str, Any] = {}
    if not text:
        return filters
    parts = text.strip().split()
    keywords: List[str] = []
    for p in parts:
        if ":" in p:
            k, v = p.split(":", 1)
            k = k.lower()
            v = v.strip()
            if k in ("loc", "l"):
                filters["location"] = v
            elif k in ("hours", "h"):
                try:
                    filters["hours_old"] = int(v)
                except Exception:
                    pass
            elif k in ("remote", "r"):
                vv = v.lower()
                if vv in ("yes", "true", "1"):
                    filters["remote"] = True
                elif vv in ("no", "false", "0"):
                    filters["remote"] = False
                else:
                    filters["remote"] = None
            elif k in ("type", "t"):
                filters["job_type"] = v.lower()
            elif k in ("country", "c"):
                filters["country_indeed"] = v.lower()
            else:
                keywords.append(p)
        else:
            keywords.append(p)
    if keywords:
        filters["keywords"] = " ".join(keywords)
    return filters


# Conversation states
ASK_KEYWORDS, ASK_LOCATION, ASK_JOBTYPE, ASK_REMOTE, ASK_HOURS, CONFIRM = range(6)


def _lang(context: ContextTypes.DEFAULT_TYPE, uid: int) -> str:
    return get_user(uid).get("lang", "ru")


def _role(context: ContextTypes.DEFAULT_TYPE, uid: int) -> str:
    return get_user(uid).get("role", "jobseeker")


def _sources(uid: int) -> List[str]:
    s = get_user(uid).get("sources")
    return s if s else DEFAULT_SOURCES


def _active_sources(uid: int, context: ContextTypes.DEFAULT_TYPE) -> List[str]:
    override = context.user_data.get("sources_override")
    if override:
        return override
    return _sources(uid)


def _country(uid: int) -> str:
    return get_user(uid).get("country_indeed", "usa")


def kb_sources(uid: int, lang: str) -> InlineKeyboardMarkup:
    all_sites = [
        ("LinkedIn", "linkedin"),
        ("Indeed", "indeed"),
        ("Google", "google"),
        ("ZipRecruiter", "zip_recruiter"),
        ("Glassdoor", "glassdoor"),
        ("Bayt", "bayt"),
        ("Naukri", "naukri"),
        ("BDJobs", "bdjobs"),
    ]
    active = set(_sources(uid))
    rows = []
    for i in range(0, len(all_sites), 2):
        chunk = all_sites[i : i + 2]
        row = []
        for name, key in chunk:
            prefix = "✅ " if key in active else "▫️ "
            row.append(InlineKeyboardButton(prefix + name, callback_data=f"src:{key}"))
        rows.append(row)
    rows.append([InlineKeyboardButton(label(lang, "all"), callback_data="src:all"), InlineKeyboardButton(label(lang, "none"), callback_data="src:none")])
    rows.append([InlineKeyboardButton(label(lang, "ok"), callback_data="src:ok")])
    return InlineKeyboardMarkup(rows)


def kb_lang() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("Русский", callback_data="lang:ru"), InlineKeyboardButton("English", callback_data="lang:en")]
        ]
    )


def kb_jobtype(lang: str) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(label(lang, "jt_fulltime"), callback_data="jt:fulltime"), InlineKeyboardButton(label(lang, "jt_parttime"), callback_data="jt:parttime")],
        [InlineKeyboardButton(label(lang, "jt_contract"), callback_data="jt:contract"), InlineKeyboardButton(label(lang, "jt_internship"), callback_data="jt:internship")],
        [InlineKeyboardButton(label(lang, "skip"), callback_data="jt:skip")],
    ]
    return InlineKeyboardMarkup(rows)


def kb_remote(lang: str) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(label(lang, "yes"), callback_data="rem:yes"), InlineKeyboardButton(label(lang, "no"), callback_data="rem:no")],
        [InlineKeyboardButton(label(lang, "skip"), callback_data="rem:skip")],
    ]
    return InlineKeyboardMarkup(rows)


def kb_hours(lang: str) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(label(lang, "h_24"), callback_data="h:24"), InlineKeyboardButton(label(lang, "h_72"), callback_data="h:72")],
        [InlineKeyboardButton(label(lang, "h_168"), callback_data="h:168"), InlineKeyboardButton(label(lang, "any"), callback_data="h:skip")],
    ]
    return InlineKeyboardMarkup(rows)


def kb_skip(lang: str) -> InlineKeyboardMarkup:
    """Single-button inline keyboard to skip an optional step."""
    return InlineKeyboardMarkup([[InlineKeyboardButton(label(lang, "skip"), callback_data="loc:skip")]])


def kb_results(lang: str, page: int, more: bool = True) -> InlineKeyboardMarkup:
    rows = []
    if more:
        rows.append([InlineKeyboardButton(label(lang, "more"), callback_data=f"page:{page+1}")])
    rows.append([InlineKeyboardButton(label(lang, "narrow"), callback_data="refine")])
    return InlineKeyboardMarkup(rows)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    user = get_user(uid)
    lang = user.get("lang", "ru")
    first = update.effective_user.first_name or ""
    await update.message.reply_text(t(lang, "greet", first_name=first))
    await update.message.reply_text(t(lang, "choose_lang"), reply_markup=kb_lang())


async def cb_lang(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    uid = query.from_user.id
    _, value = query.data.split(":", 1)
    update_user(uid, {"lang": value})
    lang = value
    await query.edit_message_text(t(lang, "role_q"))
    kb = InlineKeyboardMarkup(
        [
            [InlineKeyboardButton(t(lang, "role_jobseeker"), callback_data="role:jobseeker"),
             InlineKeyboardButton(t(lang, "role_recruiter"), callback_data="role:recruiter")]
        ]
    )
    await query.message.reply_text(t(lang, "consent"))
    await query.message.reply_text("—", reply_markup=kb)


async def cb_role(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    uid = query.from_user.id
    _, value = query.data.split(":", 1)
    update_user(uid, {"role": value})
    lang = _lang(context, uid)
    await query.edit_message_text(t(lang, "notifications_q"))
    kb = InlineKeyboardMarkup(
        [[InlineKeyboardButton(label(lang, "yes"), callback_data="notif:on"), InlineKeyboardButton(label(lang, "no"), callback_data="notif:off")]]
    )
    # Telegram requires non-empty text; use an em dash placeholder
    await query.message.reply_text("—", reply_markup=kb)
    # Allow replying by text (да/нет/yes/no/ok) in addition to pressing buttons
    context.user_data["awaiting_notif"] = True
    # Role-based tip
    if value in ("recruiter", "hr", "recruiter/hr"):
        await query.message.reply_text(t(lang, "tip_summary"))


async def cb_notif(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    uid = query.from_user.id
    _, value = query.data.split(":", 1)
    update_user(uid, {"notifications": value == "on"})
    context.user_data.pop("awaiting_notif", None)
    lang = _lang(context, uid)
    await query.edit_message_text(t(lang, "done_onboarding"))
    await query.message.reply_text(t(lang, "menu"))
    await query.message.reply_text(t(lang, "disclaimer"))
    # Feature discovery after onboarding
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton(label(lang, "about"), callback_data="about:show"), InlineKeyboardButton(label(lang, "tour"), callback_data="tour:1")],
        [InlineKeyboardButton("/search", callback_data="cta:search")],
    ])
    await query.message.reply_text(t(lang, "overview_q"), reply_markup=kb)

async def msg_notif(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Fallback text handler for the notifications question during onboarding.
    Accepts yes/no style answers when the user didn't press the inline buttons.
    """
    if not context.user_data.get("awaiting_notif"):
        return
    text = (update.message.text or "").strip().lower()
    # Normalize common confirmations/declines in RU/EN
    yes_words = {"да", "ага", "ок", "ну ок", "окей", "yes", "y", "ok", "okay", "sure", "on", "включи", "вкл"}
    no_words = {"нет", "no", "n", "off", "выключи", "выкл"}
    # Strip punctuation
    import re
    norm = re.sub(r"[!.,;:]+", "", text)
    choice = None
    if norm in yes_words:
        choice = True
    elif norm in no_words:
        choice = False
    if choice is None:
        return
    uid = update.effective_user.id
    update_user(uid, {"notifications": choice})
    context.user_data.pop("awaiting_notif", None)
    lang = _lang(context, uid)
    await update.message.reply_text(t(lang, "done_onboarding"))
    await update.message.reply_text(t(lang, "menu"))
    await update.message.reply_text(t(lang, "disclaimer"))
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton(label(lang, "about"), callback_data="about:show"), InlineKeyboardButton(label(lang, "tour"), callback_data="tour:1")],
        [InlineKeyboardButton("/search", callback_data="cta:search")],
    ])
    await update.message.reply_text(t(lang, "overview_q"), reply_markup=kb)


async def cmd_sources(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    await update.message.reply_text(t(lang, "sources_title"), reply_markup=kb_sources(uid, lang))
    await update.message.reply_text(t(lang, "sources_hint"))


async def cb_sources(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    uid = query.from_user.id
    lang = _lang(context, uid)
    _, key = query.data.split(":", 1)
    if key == "ok":
        await query.edit_message_text(label(lang, "ok"))
        return
    if key == "all":
        update_user(uid, {"sources": [
            "linkedin","indeed","google","zip_recruiter","glassdoor","bayt","naukri","bdjobs"
        ]})
        await query.edit_message_reply_markup(reply_markup=kb_sources(uid, lang))
        return
    if key == "none":
        update_user(uid, {"sources": []})
        await query.edit_message_reply_markup(reply_markup=kb_sources(uid, lang))
        return
    user = get_user(uid)
    srcs = set(user.get("sources") or [])
    if key in srcs:
        srcs.remove(key)
    else:
        srcs.add(key)
    if not srcs:
        srcs = set(DEFAULT_SOURCES)
    update_user(uid, {"sources": list(srcs)})
    await query.edit_message_reply_markup(reply_markup=kb_sources(uid, lang))


async def cmd_region(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    await update.message.reply_text(t(lang, "region_title"))
    return 1


async def cmd_region_list(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    # Build list from Country enum
    try:
        from jobspy.model import Country
        names = []
        for c in Country:
            nm = c.value[0].split(",")[0]
            if nm in ("usa/ca", "worldwide"):
                continue
            names.append(nm)
        names = sorted(set(names))
        # chunk into lines
        out = ", ".join(names)
    except Exception as e:
        out = "usa, uk, india, germany, france, canada, australia, singapore, mexico, uae"
    await update.message.reply_text(t(lang, "region_list_title"))
    await update.message.reply_text(out)


async def set_region(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    country = (update.message.text or "").strip().lower()
    update_user(uid, {"country_indeed": country})
    await update.message.reply_text(t(lang, "region_saved", country=country))
    return ConversationHandler.END


# ---- Search Conversation ----

def kb_examples(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("Python developer remote 72h", callback_data="ex:python"),
            InlineKeyboardButton("Data analyst SQL Berlin", callback_data="ex:analyst"),
        ],
        [
            InlineKeyboardButton("Product manager fintech", callback_data="ex:pm"),
        ],
    ])


async def cmd_search(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    context.user_data["filters"] = {}
    await update.message.reply_text(t(lang, "search_intro"))
    await update.message.reply_text(t(lang, "q_keywords"), reply_markup=kb_examples(lang))
    return ASK_KEYWORDS


async def ask_location(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    text = (update.message.text or "").strip()
    if len(text) > 256:
        await update.message.reply_text(t(lang, "err_long", n=256))
        return ASK_KEYWORDS
    context.user_data["filters"]["keywords"] = text
    await update.message.reply_text(t(lang, "q_location"), reply_markup=kb_skip(lang))
    return ASK_LOCATION


async def ask_jobtype(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    # Normalize the location input. Support quick skip tokens.
    raw = (update.message.text or "").strip()
    norm = raw.lower()
    skip_tokens = {"—", "-", "", "any", "all", "skip", "none", "n/a", "na", "везде", "пусто", "не важно", "неважно"}
    loc = None if norm in skip_tokens else raw
    context.user_data["filters"]["location"] = loc or None
    await update.message.reply_text(t(lang, "q_jobtype"), reply_markup=kb_jobtype(lang))
    return ASK_JOBTYPE


async def cb_loc_skip(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Inline handler to skip the optional location step."""
    q = update.callback_query
    await q.answer()
    uid = q.from_user.id
    lang = _lang(context, uid)
    context.user_data.setdefault("filters", {})["location"] = None
    # Replace the prompt with a confirmation and proceed
    try:
        await q.edit_message_text(t(lang, "location_any"))
    except Exception:
        pass
    await q.message.reply_text(t(lang, "q_jobtype"), reply_markup=kb_jobtype(lang))
    return ASK_JOBTYPE


async def cb_jobtype(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    uid = query.from_user.id
    lang = _lang(context, uid)
    _, val = query.data.split(":", 1)
    context.user_data["filters"]["job_type"] = None if val == "skip" else val
    await query.edit_message_text(t(lang, "q_remote"))
    # Telegram requires non-empty text; use an em dash placeholder
    await query.message.reply_text("—", reply_markup=kb_remote(lang))
    return ASK_REMOTE


async def cb_remote(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    uid = query.from_user.id
    lang = _lang(context, uid)
    _, val = query.data.split(":", 1)
    remote = True if val == "yes" else False if val == "no" else None
    context.user_data["filters"]["remote"] = remote
    await query.edit_message_text(t(lang, "q_hours"))
    # Telegram requires non-empty text; use an em dash placeholder
    await query.message.reply_text("—", reply_markup=kb_hours(lang))
    return ASK_HOURS


async def cb_hours(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    uid = query.from_user.id
    lang = _lang(context, uid)
    _, val = query.data.split(":", 1)
    hours = None if val == "skip" else int(val)
    context.user_data["filters"]["hours_old"] = hours
    filters = context.user_data.get("filters", {})
    txt = t(lang, "confirm_filters") + f"\n\n" + str(filters)
    await query.edit_message_text(txt)
    await query.message.reply_text(t(lang, "search_running"))
    # Fetch results fresh and store rows in session
    uid = query.message.chat_id
    # Source compatibility hint for Indeed
    srcs = _active_sources(uid, context)
    if (filters.get("hours_old") is not None) and (filters.get("remote") is not None or filters.get("job_type")) and ("indeed" in srcs):
        await query.message.reply_text(t(lang, "indeed_hint"))
    country = _country(uid)
    try:
        rows, total = search_jobs(filters, srcs, country, results_wanted=30, offset=0)
    except Exception as e:
        await query.message.reply_text(t(lang, "err") + f"\n{e}")
        return ConversationHandler.END
    if not rows:
        await query.message.reply_text(t(lang, "no_results"))
        return ConversationHandler.END
    # Save in session and persistent store
    context.user_data["rows"] = rows
    context.user_data["page"] = 1
    save_last_results(uid, rows)
    await _show_page(uid, context, page=1)
    return ConversationHandler.END


async def cb_example(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    uid = query.from_user.id
    lang = _lang(context, uid)
    _, which = query.data.split(":", 1)
    examples = {
        "python": "Python developer",
        "analyst": "Data analyst SQL",
        "pm": "Product manager fintech",
    }
    kw = examples.get(which, "Python developer")
    context.user_data.setdefault("filters", {})["keywords"] = kw
    await query.edit_message_text(t(lang, "q_location"))
    # Provide a skip button for convenience
    await query.message.reply_text("—", reply_markup=kb_skip(lang))
    return ASK_LOCATION


PAGE_SIZE = 1


def _annual_amount(row: Dict[str, Any]) -> int | None:
    if (row.get("interval") or "") != "yearly":
        return None
    mi = row.get("min_amount")
    ma = row.get("max_amount")
    if mi and ma:
        try:
            return int((float(mi) + float(ma)) / 2)
        except Exception:
            return None
    v = mi or ma
    try:
        return int(float(v)) if v else None
    except Exception:
        return None


def _get_filtered_rows(context: ContextTypes.DEFAULT_TYPE, uid: int | None = None) -> List[Dict[str, Any]]:
    rows = context.user_data.get("rows") or []
    sal_min = context.user_data.get("salary_min")
    currency = context.user_data.get("currency")
    user = get_user(uid) if uid else None
    muted = set((user or {}).get("muted_companies") or [])
    include = set(context.user_data.get("company_include") or [])
    if sal_min or currency or muted or include:
        filtered = []
        for r in rows:
            if muted and r.get("company") and r.get("company") in muted:
                continue
            if include and r.get("company") not in include:
                continue
            if currency and r.get("currency") and r.get("currency").upper() != currency.upper():
                continue
            if sal_min:
                amt = _annual_amount(r)
                if amt is None or amt < sal_min:
                    continue
            filtered.append(r)
        return filtered
    return rows


async def _fetch_more(uid: int, context: ContextTypes.DEFAULT_TYPE, needed: int):
    base_rows = context.user_data.get("rows") or []
    filters = context.user_data.get("filters", {})
    srcs = _active_sources(uid, context)
    country = _country(uid)
    offset = len(base_rows)
    try:
        new_rows, _ = search_jobs(filters, srcs, country, results_wanted=max(needed, PAGE_SIZE * 2), offset=offset)
    except Exception:
        return
    if new_rows:
        # extend with dedup handled by search_jobs already, but we ensure no duplicates against base
        seen = set(r.get("job_url") for r in base_rows)
        for r in new_rows:
            if r.get("job_url") not in seen:
                base_rows.append(r)
                seen.add(r.get("job_url"))
        context.user_data["rows"] = base_rows
        save_last_results(uid, base_rows)


async def _show_page(chat_id: int, context: ContextTypes.DEFAULT_TYPE, page: int = 1):
    uid = chat_id
    lang = _lang(context, uid)
    rows = _get_filtered_rows(context, uid)
    if not rows:
        await context.bot.send_message(chat_id, t(lang, "no_results"))
        return
    total = len(rows)
    start = (page - 1) * PAGE_SIZE
    end = start + PAGE_SIZE
    attempts = 0
    # If filtered view lacks enough rows, try fetching more base
    while total < end and attempts < 3:
        await _fetch_more(uid, context, needed=end - total)
        rows = _get_filtered_rows(context)
        total = len(rows)
        attempts += 1
    end = min(end, total)
    # Compose single card for the current job only
    for idx, job in enumerate(rows[start:end], start=start):
        title = t(lang, "card_title", title=job["title"], company=job["company"], location=job["location"])
        # Localize remote flag from boolean if present
        rb = job.get("remote_bool")
        remote_txt = "—"
        if rb is True:
            remote_txt = label(lang, "remote_yes")
        elif rb is False:
            remote_txt = label(lang, "remote_no")
        else:
            # Fallback: try provided string
            remote_txt = job.get("remote") or "—"
        meta = t(lang, "card_meta", site=job["site"], date_posted=job["date_posted"]) \
            + "\n" + t(lang, "card_type", remote=remote_txt, job_type=job["job_type"]) \
            + "\n" + t(lang, "card_salary", salary=job["salary"]) \
            + ("\n" + job["description"] if job.get("description") else "")

        # Action buttons
        rows_kb = [
            [InlineKeyboardButton(label(lang, "open"), url=job.get("job_url_raw") or job["job_url"])],
            [InlineKeyboardButton(label(lang, "fav"), callback_data=f"fav:{idx}")],
            [InlineKeyboardButton(label(lang, "similar"), callback_data=f"sim:{idx}"),
             InlineKeyboardButton(label(lang, "share"), callback_data=f"share:{idx}")],
            [InlineKeyboardButton(label(lang, "mute_company"), callback_data=f"mute:{idx}")],
        ]
        # Navigation (next/refine) inline with the card
        more = end < total
        nav_row = []
        if more:
            nav_row.append(InlineKeyboardButton(label(lang, "more"), callback_data=f"page:{page+1}"))
        nav_row.append(InlineKeyboardButton(label(lang, "narrow"), callback_data="refine"))
        rows_kb.append(nav_row)
        kb = InlineKeyboardMarkup(rows_kb)

        disable_prev = not bool(get_user(uid).get("previews"))
        # Send a single message as a compact card
        card_text = title + "\n" + meta
        await context.bot.send_message(chat_id, card_text, reply_markup=kb, disable_web_page_preview=disable_prev)

    # Send disclaimer only on the first page to reduce noise
    if page == 1:
        await context.bot.send_message(chat_id, t(lang, "disclaimer"))

    # Feature discovery CTA
    cta_kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("/save", callback_data="cta:save"),
            InlineKeyboardButton("/subs", callback_data="cta:subs"),
        ],
        [
            InlineKeyboardButton("/sources", callback_data="cta:sources"),
            InlineKeyboardButton("/export", callback_data="cta:export"),
        ],
        [
            InlineKeyboardButton("/tour", callback_data="cta:tour"),
            InlineKeyboardButton("/suggest", callback_data="cta:suggest"),
        ],
    ])
    if page == 1:
        await context.bot.send_message(chat_id, t(lang, "cta_tips"), reply_markup=cta_kb)


async def cb_page(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    uid = query.from_user.id
    _, page = query.data.split(":", 1)
    await _show_page(uid, context, page=int(page))


def kb_refine(lang: str) -> InlineKeyboardMarkup:
    hp = label(lang, "remote_prefix")
    tp = label(lang, "type_prefix")
    sp = label(lang, "sort_prefix")
    salp = label(lang, "salary_prefix")
    curp = label(lang, "currency_prefix")
    dp = label(lang, "distance_prefix")
    srcp = label(lang, "sources_prefix")
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(label(lang, "h_24"), callback_data="ref:h:24"), InlineKeyboardButton(label(lang, "h_72"), callback_data="ref:h:72"), InlineKeyboardButton(label(lang, "h_168"), callback_data="ref:h:168")],
        [InlineKeyboardButton(f"{hp}: {label(lang, 'yes')}", callback_data="ref:r:yes"), InlineKeyboardButton(label(lang, "no"), callback_data="ref:r:no"), InlineKeyboardButton(label(lang, "any"), callback_data="ref:r:any")],
        [InlineKeyboardButton(f"{tp}: {label(lang, 'jt_fulltime')}", callback_data="ref:t:fulltime"), InlineKeyboardButton(label(lang, "jt_contract"), callback_data="ref:t:contract"), InlineKeyboardButton(label(lang, "any"), callback_data="ref:t:any")],
        [InlineKeyboardButton(f"{sp}: " + ("Зарплата" if lang=='ru' else "Salary"), callback_data="ref:s:salary"), InlineKeyboardButton(("Дата" if lang=='ru' else "Date"), callback_data="ref:s:date")],
        [InlineKeyboardButton(f"{salp}: 50k", callback_data="ref:salmin:50000"), InlineKeyboardButton("100k", callback_data="ref:salmin:100000"), InlineKeyboardButton("200k", callback_data="ref:salmin:200000")],
        [InlineKeyboardButton(t(lang, "salary_any"), callback_data="ref:salmin:any")],
        [InlineKeyboardButton(f"{curp}: USD", callback_data="ref:cur:USD"), InlineKeyboardButton("EUR", callback_data="ref:cur:EUR"), InlineKeyboardButton(label(lang, "any"), callback_data="ref:cur:any")],
        [InlineKeyboardButton(f"{dp}: 10", callback_data="ref:dist:10"), InlineKeyboardButton("25", callback_data="ref:dist:25"), InlineKeyboardButton("50", callback_data="ref:dist:50"), InlineKeyboardButton("100", callback_data="ref:dist:100")],
        [InlineKeyboardButton(f"{srcp}: LI", callback_data="ref:src:linkedin"), InlineKeyboardButton("IN", callback_data="ref:src:indeed"), InlineKeyboardButton("GG", callback_data="ref:src:google"), InlineKeyboardButton("ZR", callback_data="ref:src:zip_recruiter"), InlineKeyboardButton("GD", callback_data="ref:src:glassdoor")],
        [InlineKeyboardButton(label(lang, "companies"), callback_data="ref:cmp:open")],
    ])


async def cb_refine_open(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    uid = q.from_user.id
    lang = _lang(context, uid)
    await q.message.reply_text(t(lang, "refine_title"), reply_markup=kb_refine(lang))


async def cb_refine_apply(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    uid = q.from_user.id
    lang = _lang(context, uid)
    _, kind, val = q.data.split(":", 2)
    if kind == "h":
        context.user_data.setdefault("filters", {})["hours_old"] = int(val)
    elif kind == "r":
        rv = None if val == "any" else (True if val == "yes" else False)
        context.user_data.setdefault("filters", {})["remote"] = rv
    elif kind == "t":
        tv = None if val == "any" else val
        context.user_data.setdefault("filters", {})["job_type"] = tv
    elif kind == "s":
        mode = val
        rows = context.user_data.get("rows") or []
        if mode == "salary":
            rows.sort(key=lambda r: (r.get("min_amount") or 0, r.get("max_amount") or 0), reverse=True)
        elif mode == "date":
            # date_posted is dd.mm.yyyy or —
            from datetime import datetime
            def parse_d(s):
                try:
                    return datetime.strptime(s, "%d.%m.%Y").timestamp()
                except Exception:
                    return 0
            rows.sort(key=lambda r: parse_d(r.get("date_posted") or ""), reverse=True)
        context.user_data["rows"] = rows
        await q.message.reply_text(t(lang, "sort_updated", mode=mode))
        await _show_page(uid, context, page=1)
        return
    elif kind == "salmin":
        if val == "any":
            context.user_data["salary_min"] = None
            await q.message.reply_text(t(lang, "salary_any"))
        else:
            try:
                context.user_data["salary_min"] = int(val)
                await q.message.reply_text(t(lang, "salary_updated", amount=val))
            except Exception:
                context.user_data["salary_min"] = None
        await _show_page(uid, context, page=1)
        return
    elif kind == "cur":
        currency = None if val == "any" else val.upper()
        context.user_data["currency"] = currency
        await _show_page(uid, context, page=1)
        return
    elif kind == "dist":
        try:
            context.user_data.setdefault("filters", {})["distance"] = int(val)
        except Exception:
            pass
        # re-run search to apply distance
        filters = context.user_data.get("filters", {})
        try:
            rows, total = search_jobs(filters, _active_sources(uid, context), _country(uid), results_wanted=30, offset=0)
        except Exception as e:
            await q.message.reply_text(t(lang, "err") + f"\n{e}")
            return
        if not rows:
            await q.message.reply_text(t(lang, "no_results"))
            return
        context.user_data["rows"] = rows
        save_last_results(uid, rows)
        await _show_page(uid, context, page=1)
        return
    elif kind == "src":
        # toggle sources override
        cur = set(context.user_data.get("sources_override") or _sources(uid))
        if val in cur:
            cur.remove(val)
        else:
            cur.add(val)
        context.user_data["sources_override"] = list(cur)
        # re-run search
        filters = context.user_data.get("filters", {})
        try:
            rows, total = search_jobs(filters, _active_sources(uid, context), _country(uid), results_wanted=30, offset=0)
        except Exception as e:
            await q.message.reply_text(t(lang, "err") + f"\n{e}")
            return
        if not rows:
            await q.message.reply_text(t(lang, "no_results"))
            return
        context.user_data["rows"] = rows
        save_last_results(uid, rows)
        await _show_page(uid, context, page=1)
        return
    elif kind == "cmp" and val == "open":
        # Build dynamic keyboard of top companies from current rows
        rows = _get_filtered_rows(context, uid)
        from collections import Counter
        cnt = Counter([r.get("company") for r in rows if r.get("company")])
        top = [c for c,_ in cnt.most_common(12)]
        if not top:
            await q.message.reply_text(t(lang, "no_companies"))
            return
        buttons = []
        row = []
        for i, name in enumerate(top, 1):
            row.append(InlineKeyboardButton(name[:24], callback_data=f"cmp:add:{name}"))
            if i % 3 == 0:
                buttons.append(row)
                row = []
        if row:
            buttons.append(row)
        buttons.append([InlineKeyboardButton(label(lang, "none"), callback_data="cmp:clear:0")])
        await q.message.reply_text(t(lang, "choose_companies"), reply_markup=InlineKeyboardMarkup(buttons))
    # re-run the search with updated filters
    filters = context.user_data.get("filters", {})
    try:
        rows, total = search_jobs(filters, _sources(uid), _country(uid), results_wanted=30, offset=0)
    except Exception as e:
        await q.message.reply_text(t(lang, "err") + f"\n{e}")
        return
    if not rows:
        await q.message.reply_text(t(lang, "no_results"))
        return
    context.user_data["rows"] = rows
    context.user_data["page"] = 1
    save_last_results(uid, rows)
    await _show_page(uid, context, page=1)


async def cb_fav(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    uid = query.from_user.id
    _, idx_s = query.data.split(":", 1)
    try:
        idx = int(idx_s)
    except Exception:
        return
    jobs = context.user_data.get("rows") or get_last_results(uid)
    found = jobs[idx] if (jobs and 0 <= idx < len(jobs)) else None
    lang = _lang(context, uid)
    if not found:
        await query.edit_message_text(t(lang, "err"))
        return
    ok = save_favorite(uid, found)
    await query.edit_message_text(t(lang, "added_fav" if ok else "already_fav"))


async def cmd_favorites(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    favs = list_favorites(uid)
    if not favs:
        await update.message.reply_text(t(lang, "no_favorites"))
        return
    await update.message.reply_text(t(lang, "favorites_list", n=len(favs)))
    for j in favs[:20]:
        link = j.get('job_url_raw') or j.get('job_url')
        txt = f"{j.get('title')} — {j.get('company')} • {j.get('location')}\n{link}"
        await update.message.reply_text(txt, disable_web_page_preview=True)


async def cmd_favorites_clear(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    clear_favorites(uid)
    await update.message.reply_text(t(lang, "favorites_cleared"))


async def cmd_saved(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    saved = list_saved_searches(uid)
    if not saved:
        await update.message.reply_text(t(lang, "no_saved"))
        return
    await update.message.reply_text(t(lang, "saved_list"))
    for i, s in enumerate(saved[:20]):
        name = s.get('name')
        flt = s.get('filters')
        subs = s.get('subs') or {}
        freq = subs.get('freq') or 'off'
        paused = subs.get('paused') is True
        btns = [
            [InlineKeyboardButton(label(lang, "run"), callback_data=f"ss:run:{i}"), InlineKeyboardButton(label(lang, "delete"), callback_data=f"ss:del:{i}")],
            [InlineKeyboardButton(f"{label(lang, 'freq_label')}: {freq}", callback_data=f"ss:noop:{i}"), InlineKeyboardButton(label(lang, "off"), callback_data=f"ss:freq:{i}:off"), InlineKeyboardButton(label(lang, "daily"), callback_data=f"ss:freq:{i}:daily"), InlineKeyboardButton(label(lang, "every_3d"), callback_data=f"ss:freq:{i}:3d"), InlineKeyboardButton(label(lang, "weekly"), callback_data=f"ss:freq:{i}:weekly")],
            [InlineKeyboardButton(label(lang, "pause"), callback_data=f"ss:toggle:{i}") if not paused else InlineKeyboardButton(label(lang, "resume"), callback_data=f"ss:toggle:{i}")],
            [InlineKeyboardButton(label(lang, "send_now"), callback_data=f"ss:digest:{i}")],
        ]
        await update.message.reply_text(f"• {name}: {flt}", reply_markup=InlineKeyboardMarkup(btns))


async def cmd_subs(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton(label(lang, "daily"), callback_data="sub:daily"), InlineKeyboardButton(label(lang, "every_3d"), callback_data="sub:3d")],
        [InlineKeyboardButton(label(lang, "weekly"), callback_data="sub:weekly")],
    ])
    await update.message.reply_text(t(lang, "subs_title"), reply_markup=kb)


async def cb_subs(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    uid = query.from_user.id
    lang = _lang(context, uid)
    _, freq = query.data.split(":", 1)
    update_user(uid, {"subs": {"freq": freq}})
    await query.edit_message_text(t(lang, "subs_saved", freq=freq))


async def cmd_export(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    rows = get_last_results(uid) or list_favorites(uid)
    if not rows:
        await update.message.reply_text(t(lang, "no_results"))
        return
    # Export to CSV in memory
    import csv
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    data = io.BytesIO(buf.getvalue().encode("utf-8"))
    data.name = "jobs.csv"
    await update.message.reply_document(document=InputFile(data, filename="jobs.csv"))


async def cmd_settings(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    user = get_user(uid)
    lang = user.get("lang", "ru")
    txt = t(
        lang,
        "settings",
        lang=lang,
        role=user.get("role"),
        sources=", ".join(user.get("sources") or []),
        country=user.get("country_indeed"),
    )
    await update.message.reply_text(txt)
    status_label = label(lang, "on") if user.get("previews") else label(lang, "off_state")
    await update.message.reply_text(t(lang, "previews_status", status=status_label))
    await update.message.reply_text(t(lang, "base_currency", currency=(user.get("base_currency") or "—")))


async def cmd_data_export(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    data = export_user(uid)
    import json, io
    raw = json.dumps(data, ensure_ascii=False, indent=2)
    bio = io.BytesIO(raw.encode("utf-8"))
    bio.name = f"microstudio_user_{uid}.json"
    await update.message.reply_document(document=InputFile(bio, filename=bio.name), caption=t(lang, "export_ready"))


async def cmd_data_delete(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton(label(lang, "yes"), callback_data="del:yes"), InlineKeyboardButton(label(lang, "no"), callback_data="del:no")]
    ])
    await update.message.reply_text(t(lang, "confirm_delete"), reply_markup=kb)


async def cb_data_delete(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    uid = q.from_user.id
    lang = _lang(context, uid)
    _, v = q.data.split(":", 1)
    if v == "yes":
        delete_user(uid)
        await q.edit_message_text(t(lang, "deleted"))
    else:
        await q.edit_message_text(label(lang, "cancel"))


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    await update.message.reply_text(t(lang, "help"))
    await update.message.reply_text(t(lang, "menu"))
    await update.message.reply_text(t(lang, "help_q"))


# ---- Marketing: /about & /tour ----

async def cmd_about(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    kb = InlineKeyboardMarkup(
        [
            [InlineKeyboardButton(label(lang, "try_now"), callback_data="about:try"),
             InlineKeyboardButton(label(lang, "tour"), callback_data="tour:1")],
        ]
    )
    await update.message.reply_text(t(lang, "about_title"))
    await update.message.reply_text(t(lang, "about_body"), reply_markup=kb)


async def cb_about(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    uid = query.from_user.id
    lang = _lang(context, uid)
    _, action = query.data.split(":", 1)
    if action == "try":
        # Kick off search flow
        await query.edit_message_text(t(lang, "about_cta"))
        # simulate user typing /search instruction
        await context.bot.send_message(chat_id=uid, text="/search")
    else:
        # Show about content inline
        kb = InlineKeyboardMarkup(
            [[InlineKeyboardButton(label(lang, "try_now"), callback_data="about:try"), InlineKeyboardButton(label(lang, "tour"), callback_data="tour:1")]]
        )
        await query.edit_message_text(t(lang, "about_title"))
        await context.bot.send_message(chat_id=uid, text=t(lang, "about_body"), reply_markup=kb)


def _kb_tour(lang: str, step: int, last: int = 6) -> InlineKeyboardMarkup:
    buttons = []
    if step < last:
        buttons.append(InlineKeyboardButton(label(lang, "next"), callback_data=f"tour:{step+1}"))
    else:
        buttons.append(InlineKeyboardButton(label(lang, "close"), callback_data="tour:close"))
    return InlineKeyboardMarkup([buttons])


async def cmd_tour(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = _lang(context, uid)
    await update.message.reply_text(t(lang, "tour_1"), reply_markup=_kb_tour(lang, 1))


async def cb_tour(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    uid = query.from_user.id
    lang = _lang(context, uid)
    _, payload = query.data.split(":", 1)
    if payload == "close":
        await query.edit_message_text(t(lang, "tour_done"))
        return
    step = int(payload)
    key = f"tour_{step}"
    await query.edit_message_text(t(lang, key), reply_markup=_kb_tour(lang, step))


def build_app() -> Application:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("Set TELEGRAM_BOT_TOKEN env var")
    async def post_init(app: Application):
        from telegram import BotCommand
        # Ensure webhook is removed before starting long polling to avoid conflicts
        try:
            await app.bot.delete_webhook(drop_pending_updates=True)
        except Exception:
            # Safe to ignore if no webhook set or network hiccup; polling will still attempt
            pass
        # Default commands (EN)
        commands = [
            BotCommand("start", "Start / Onboarding"),
            BotCommand("search", "Guided search"),
            BotCommand("q", "Quick search one-liner"),
            BotCommand("sources", "Choose job sources"),
            BotCommand("region", "Country for Indeed/Glassdoor"),
            BotCommand("region_list", "List countries for region"),
            BotCommand("favorites", "List favorites"),
            BotCommand("favorites_clear", "Clear favorites"),
            BotCommand("saved", "Saved searches"),
            BotCommand("save", "Save current search"),
            BotCommand("subs", "Subscriptions"),
            BotCommand("export", "Export CSV"),
            BotCommand("summary", "Market summary (last results)"),
            BotCommand("settings", "Settings"),
            BotCommand("data_export", "Export my data (JSON)"),
            BotCommand("data_delete", "Delete my data"),
            BotCommand("previews", "Toggle web previews"),
            BotCommand("about", "About bot"),
            BotCommand("tour", "Feature tour"),
            BotCommand("help", "Help"),
        ]
        await app.bot.set_my_commands(commands)
        # RU descriptions
        ru_commands = [
            BotCommand("start", "Старт / онбординг"),
            BotCommand("search", "Пошаговый поиск"),
            BotCommand("q", "Быстрый поиск одной строкой"),
            BotCommand("sources", "Источники вакансий"),
            BotCommand("region", "Страна для Indeed/Glassdoor"),
            BotCommand("region_list", "Список стран для /region"),
            BotCommand("favorites", "Избранное"),
            BotCommand("favorites_clear", "Очистить избранное"),
            BotCommand("saved", "Сохранённые запросы"),
            BotCommand("save", "Сохранить текущий поиск"),
            BotCommand("subs", "Подписки"),
            BotCommand("export", "Экспорт CSV"),
            BotCommand("summary", "Рыночная сводка (последняя выдача)"),
            BotCommand("settings", "Настройки"),
            BotCommand("data_export", "Экспорт моих данных (JSON)"),
            BotCommand("data_delete", "Удалить мои данные"),
            BotCommand("previews", "Веб-превью ссылок"),
            BotCommand("about", "О боте"),
            BotCommand("tour", "Тур по функциям"),
            BotCommand("help", "Помощь"),
        ]
        await app.bot.set_my_commands(ru_commands, language_code="ru")
        # Start background scheduler for digests once the event loop is up
        try:
            start_scheduler(app)
        except Exception:
            # Non-fatal if scheduler can't start; bot will still run
            pass

    app = Application.builder().token(token).post_init(post_init).build()

    # Start & onboarding
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CallbackQueryHandler(cb_lang, pattern=r"^lang:"))
    app.add_handler(CallbackQueryHandler(cb_role, pattern=r"^role:"))
    app.add_handler(CallbackQueryHandler(cb_notif, pattern=r"^notif:"))
    # Text fallback for notifications question
    from telegram.ext import MessageHandler as _MH
    app.add_handler(_MH(filters.Regex(r"(?i)^(да|ага|ок|ну ок|окей|yes|y|ok|okay|sure|on|включи|вкл|нет|no|n|off|выключи|выкл)$") & ~filters.COMMAND, msg_notif, block=False))

    # Sources & region
    app.add_handler(CommandHandler("sources", cmd_sources))
    app.add_handler(CallbackQueryHandler(cb_sources, pattern=r"^src:"))

    # Region conversation (one-step)
    # per_message=True requires all states to use CallbackQueryHandler; we mix message handlers,
    # so keep default (per_chat) to avoid PTB warnings.
    region_conv = ConversationHandler(
        entry_points=[CommandHandler("region", cmd_region)],
        states={1: [MessageHandler(filters.TEXT & ~filters.COMMAND, set_region)]},
        fallbacks=[CommandHandler("cancel", lambda u, c: ConversationHandler.END)],
    )
    app.add_handler(region_conv)

    # Search conversation
    conv = ConversationHandler(
        entry_points=[CommandHandler("search", cmd_search)],
        states={
            ASK_KEYWORDS: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, ask_location),
                CallbackQueryHandler(cb_example, pattern=r"^ex:"),
            ],
            ASK_LOCATION: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, ask_jobtype),
                CallbackQueryHandler(cb_loc_skip, pattern=r"^loc:"),
            ],
            ASK_JOBTYPE: [CallbackQueryHandler(cb_jobtype, pattern=r"^jt:")],
            ASK_REMOTE: [CallbackQueryHandler(cb_remote, pattern=r"^rem:")],
            ASK_HOURS: [CallbackQueryHandler(cb_hours, pattern=r"^h:")],
        },
        fallbacks=[CommandHandler("cancel", lambda u, c: ConversationHandler.END)],
    )
    app.add_handler(conv)
    app.add_handler(CallbackQueryHandler(cb_page, pattern=r"^page:"))
    app.add_handler(CallbackQueryHandler(cb_fav, pattern=r"^fav:"))
    async def cb_mute(update: Update, context: ContextTypes.DEFAULT_TYPE):
        q = update.callback_query
        await q.answer()
        uid = q.from_user.id
        lang = _lang(context, uid)
        _, idx_s = q.data.split(":", 1)
        try:
            idx = int(idx_s)
        except Exception:
            return
        rows = context.user_data.get("rows") or []
        if not rows or idx < 0 or idx >= len(rows):
            return
        company = rows[idx].get("company")
        if company:
            user = get_user(uid)
            muted = set(user.get("muted_companies") or [])
            muted.add(company)
            update_user(uid, {"muted_companies": list(muted)})
            await q.edit_message_text(t(lang, "muted_added", company=company))
            # refresh page 1
            await _show_page(uid, context, page=1)

    app.add_handler(CallbackQueryHandler(cb_mute, pattern=r"^mute:"))
    async def cb_sim(update: Update, context: ContextTypes.DEFAULT_TYPE):
        q = update.callback_query
        await q.answer()
        uid = q.from_user.id
        lang = _lang(context, uid)
        _, idx_s = q.data.split(":", 1)
        try:
            idx = int(idx_s)
        except Exception:
            return
        rows = context.user_data.get("rows") or []
        if idx < 0 or idx >= len(rows):
            return
        job = rows[idx]
        # Build new filters from current + job title
        filters = dict(context.user_data.get("filters") or {})
        filters["keywords"] = job.get("title")
        context.user_data["filters"] = filters
        await q.edit_message_text(t(lang, "showing_similar"))
        try:
            new_rows, total = search_jobs(filters, _sources(uid), _country(uid), results_wanted=30, offset=0)
        except Exception as e:
            await q.message.reply_text(t(lang, "err") + f"\n{e}")
            return
        if not new_rows:
            await q.message.reply_text(t(lang, "no_results"))
            return
        context.user_data["rows"] = new_rows
        context.user_data["page"] = 1
        save_last_results(uid, new_rows)
        await _show_page(uid, context, page=1)

    async def cb_share(update: Update, context: ContextTypes.DEFAULT_TYPE):
        q = update.callback_query
        await q.answer()
        uid = q.from_user.id
        lang = _lang(context, uid)
        _, idx_s = q.data.split(":", 1)
        try:
            idx = int(idx_s)
        except Exception:
            return
        rows = context.user_data.get("rows") or []
        if idx < 0 or idx >= len(rows):
            return
        j = rows[idx]
        link = j.get('job_url_raw') or j.get('job_url')
        txt = f"{j.get('title')} — {j.get('company')}\n{j.get('location')} • {j.get('site')}\n{link}"
        await q.message.reply_text(txt, disable_web_page_preview=True)

    app.add_handler(CallbackQueryHandler(cb_sim, pattern=r"^sim:"))
    app.add_handler(CallbackQueryHandler(cb_share, pattern=r"^share:"))

    # Lists & subs & export
    app.add_handler(CommandHandler("favorites", cmd_favorites))
    app.add_handler(CommandHandler("favorites_clear", cmd_favorites_clear))
    app.add_handler(CommandHandler("saved", cmd_saved))
    app.add_handler(CommandHandler("subs", cmd_subs))
    app.add_handler(CallbackQueryHandler(cb_subs, pattern=r"^sub:"))
    app.add_handler(CommandHandler("export", cmd_export))
    app.add_handler(CommandHandler("settings", cmd_settings))
    app.add_handler(CommandHandler("data_export", cmd_data_export))
    app.add_handler(CommandHandler("data_delete", cmd_data_delete))
    app.add_handler(CallbackQueryHandler(cb_data_delete, pattern=r"^del:"))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("region_list", cmd_region_list))
    app.add_handler(CommandHandler("about", cmd_about))
    app.add_handler(CallbackQueryHandler(cb_about, pattern=r"^about:"))
    app.add_handler(CommandHandler("tour", cmd_tour))
    app.add_handler(CallbackQueryHandler(cb_tour, pattern=r"^tour:"))
    # Refine/sort callbacks
    app.add_handler(CallbackQueryHandler(cb_refine_open, pattern=r"^refine$"))
    app.add_handler(CallbackQueryHandler(cb_refine_apply, pattern=r"^ref:"))
    # Company include filter callbacks
    async def cb_companies(update: Update, context: ContextTypes.DEFAULT_TYPE):
        q = update.callback_query
        await q.answer()
        uid = q.from_user.id
        lang = _lang(context, uid)
        parts = q.data.split(":")
        if len(parts) < 3:
            return
        _, action, rest = parts[0], parts[1], ":".join(parts[2:])
        if action == "add":
            sel = context.user_data.get("company_include") or []
            if rest not in sel:
                sel.append(rest)
            context.user_data["company_include"] = sel
            await q.edit_message_text(t(lang, "company_added", name=rest))
            await _show_page(uid, context, page=1)
        elif action == "clear":
            context.user_data["company_include"] = []
            await q.edit_message_text(t(lang, "companies_cleared"))
            await _show_page(uid, context, page=1)

    app.add_handler(CallbackQueryHandler(cb_companies, pattern=r"^cmp:"))

    async def cb_cta(update: Update, context: ContextTypes.DEFAULT_TYPE):
        q = update.callback_query
        await q.answer()
        uid = q.from_user.id
        _, action = q.data.split(":", 1)
        mapping = {
            "search": "/search",
            "save": "/save",
            "subs": "/subs",
            "sources": "/sources",
            "export": "/export",
            "tour": "/tour",
            "suggest": "/suggest",
        }
        cmd = mapping.get(action)
        if cmd:
            await context.bot.send_message(uid, cmd)
        await q.edit_message_reply_markup(reply_markup=None)

    app.add_handler(CallbackQueryHandler(cb_cta, pattern=r"^cta:"))

    # Summary command for recruiters/HR (and everyone)
    async def cmd_summary(update: Update, context: ContextTypes.DEFAULT_TYPE):
        uid = update.effective_user.id
        lang = _lang(context, uid)
        rows = get_last_results(uid)
        if not rows:
            await update.message.reply_text(t(lang, "summary_no_data"))
            return
        n = len(rows)
        # Top sites
        from collections import Counter
        sites = Counter([r.get("site") for r in rows if r.get("site")])
        sites_txt = ", ".join([f"{k}: {v}" for k, v in sites.most_common(5)]) or "—"
        # Top locations
        locs = Counter([r.get("location") for r in rows if r.get("location") and r.get("location") != "—"]) 
        locs_txt = ", ".join([f"{k}: {v}" for k, v in locs.most_common(5)]) or "—"
        # Salaries grouped by currency & base currency band
        def avg_salary(r):
            if (r.get("interval") or "") != "yearly":
                return None
            mi = r.get("min_amount")
            ma = r.get("max_amount")
            if mi and ma:
                return (float(mi) + float(ma)) / 2
            return float(mi or ma) if (mi or ma) else None
        cur_to_vals = {}
        for r in rows:
            cur = (r.get("currency") or "").upper()
            v = avg_salary(r)
            if v is None or not cur:
                continue
            cur_to_vals.setdefault(cur, []).append(v)
        def pct(values, p):
            if not values:
                return None
            values = sorted(values)
            k = (len(values) - 1) * p
            f = int(k)
            c = min(f + 1, len(values) - 1)
            if f == c:
                return values[f]
            return values[f] + (values[c] - values[f]) * (k - f)
        bands = []
        for cur, vals in cur_to_vals.items():
            p25 = pct(vals, 0.25)
            p75 = pct(vals, 0.75)
            if p25 and p75:
                bands.append(f"{cur}: {int(p25)}–{int(p75)}/yr")
        bands_txt = ", ".join(bands) if bands else ("—")

        # Base currency band
        user = get_user(uid)
        base = (user.get("base_currency") or "USD").upper()
        base_vals = []
        for r in rows:
            v = _annual_amount_base(r, user)
            if v is not None:
                base_vals.append(v)
        base_txt = "—"
        if base_vals:
            p25b = pct(base_vals, 0.25)
            p75b = pct(base_vals, 0.75)
            if p25b and p75b:
                base_txt = f"{int(p25b)}–{int(p75b)} {base}/yr"

        # Top keywords
        import re
        STOP = set(["the","and","for","with","you","are","our","your","требования","обязанности","компания","работа","опыт","знание","знания","умение","years","year"]) 
        kw = Counter()
        for r in rows:
            text = (r.get("title") or "") + " " + (r.get("description") or "")
            words = re.findall(r"[A-Za-zА-Яа-я0-9+#.-]{2,}", text)
            for w in words:
                wl = w.lower()
                if wl.isdigit() or len(wl) < 3 or wl in STOP:
                    continue
                kw[wl] += 1
        top_kw = ", ".join([f"{k}({v})" for k, v in kw.most_common(10)]) or "—"

        body = (
            t(lang, "summary_title")
            + "\n" + t(lang, "summary_total_jobs", n=n)
            + "\n" + t(lang, "summary_top_sources", sources=sites_txt)
            + "\n" + t(lang, "summary_top_locations", locations=locs_txt)
            + "\n" + t(lang, "summary_bands_by_currency", bands=bands_txt)
            + "\n" + t(lang, "summary_band_in_base", base=base, band=base_txt)
            + "\n" + t(lang, "summary_top_keywords", keywords=top_kw)
        )
        await update.message.reply_text(body)
        await update.message.reply_text(t(lang, "summary_footer"))

    app.add_handler(CommandHandler("summary", cmd_summary))

    # Saved search callbacks
    async def cb_saved(update: Update, context: ContextTypes.DEFAULT_TYPE):
        q = update.callback_query
        await q.answer()
        uid = q.from_user.id
        lang = _lang(context, uid)
        parts = q.data.split(":")
        if len(parts) < 3:
            return
        _, action, idx_s = parts[0], parts[1], parts[2]
        try:
            idx = int(idx_s)
        except Exception:
            return
        saved = list_saved_searches(uid)
        if idx < 0 or idx >= len(saved):
            return
        entry = saved[idx]
        if action == "run":
            filters = entry.get("filters") or {}
            context.user_data["filters"] = filters
            await q.edit_message_text(t(lang, "search_running"))
            try:
                rows, total = search_jobs(filters, _active_sources(uid, context), _country(uid), results_wanted=30, offset=0)
            except Exception as e:
                await q.message.reply_text(t(lang, "err") + f"\n{e}")
                return
            if not rows:
                await q.message.reply_text(t(lang, "no_results"))
                return
            context.user_data["rows"] = rows
            context.user_data["page"] = 1
            save_last_results(uid, rows)
            await _show_page(uid, context, page=1)
        elif action == "del":
            # remove and refresh list
            lst = [s for i2, s in enumerate(saved) if i2 != idx]
            user = get_user(uid)
            user["saved_searches"] = lst
            update_user(uid, user)
            await q.edit_message_text(t(lang, "deleted_short"))
        elif action == "freq" and len(parts) == 4:
            freq = parts[3]
            entry.setdefault("subs", {})
            entry["subs"]["freq"] = None if freq == 'off' else freq
            update_saved_search(uid, idx, entry)
            await q.edit_message_text(t(lang, "subs_saved", freq=freq))
        elif action == "toggle":
            entry.setdefault("subs", {})
            entry["subs"]["paused"] = not (entry["subs"].get("paused") is True)
            update_saved_search(uid, idx, entry)
            await q.edit_message_text(t(lang, "updated"))
        elif action == "digest":
            # run one-off digest for this saved search
            filters = entry.get("filters") or {}
            try:
                rows, _ = search_jobs(filters, _active_sources(uid, context), _country(uid), results_wanted=15, offset=0)
            except Exception as e:
                await q.message.reply_text(t(lang, "err") + f"\n{e}")
                return
            if not rows:
                await q.message.reply_text(t(lang, "no_results"))
                return
            await q.message.reply_text(t(lang, "digest_for", name=entry.get('name','')))
            for j in rows[:5]:
                await q.message.reply_text(f"{j.get('title')} — {j.get('company')} • {j.get('location')}\n{j.get('job_url')}", disable_web_page_preview=True)

    app.add_handler(CallbackQueryHandler(cb_saved, pattern=r"^ss:"))

    # Quick search: /q <query>
    async def cmd_q(update: Update, context: ContextTypes.DEFAULT_TYPE):
        uid = update.effective_user.id
        lang = _lang(context, uid)
        raw = " ".join(context.args) if context.args else ""
        if not raw:
            await update.message.reply_text(t(lang, "q_format"))
            return
        filters = parse_quick_query(raw)
        # Merge with current defaults
        context.user_data["filters"] = filters
        await update.message.reply_text(t(lang, "search_running"))
        # Compatibility hint
        if (filters.get("hours_old") is not None) and (filters.get("remote") is not None or filters.get("job_type")) and ("indeed" in _active_sources(uid, context)):
            await update.message.reply_text(t(lang, "indeed_hint"))
        try:
            rows, total = search_jobs(filters, _active_sources(uid, context), _country(uid), results_wanted=30, offset=0)
        except Exception as e:
            await update.message.reply_text(t(lang, "err") + f"\n{e}")
            return
        if not rows:
            await update.message.reply_text(t(lang, "no_results"))
            return
        context.user_data["rows"] = rows
        context.user_data["page"] = 1
        save_last_results(uid, rows)
        await _show_page(uid, context, page=1)

    app.add_handler(CommandHandler("q", cmd_q))

    # Suggest top terms from last results
    async def cmd_suggest(update: Update, context: ContextTypes.DEFAULT_TYPE):
        uid = update.effective_user.id
        lang = _lang(context, uid)
        rows = get_last_results(uid) or context.user_data.get("rows") or []
        if not rows:
            await update.message.reply_text(t(lang, "no_results"))
            return
        import re
        from collections import Counter
        STOP = set(["the","and","for","with","you","are","our","your","требования","обязанности","компания","работа","опыт","знание","знания","умение","years","year"])
        cnt = Counter()
        for r in rows:
            text = (r.get("title") or "") + " " + (r.get("description") or "")
            words = re.findall(r"[A-Za-zА-Яа-я0-9+#.-]{2,}", text)
            for w in words:
                wl = w.lower()
                if wl.isdigit() or len(wl) < 3 or wl in STOP:
                    continue
                cnt[wl] += 1
        top = [w for w,_ in cnt.most_common(12) if not w.startswith("http")][:12]
        if not top:
            await update.message.reply_text(t(lang, "no_results"))
            return
        # Build chips
        rows_kb = []
        row = []
        for i, term in enumerate(top, 1):
            row.append(InlineKeyboardButton(term, callback_data=f"sg:add:{term}"))
            if i % 3 == 0:
                rows_kb.append(row)
                row = []
        if row:
            rows_kb.append(row)
        kb = InlineKeyboardMarkup(rows_kb)
        await update.message.reply_text(t(lang, "suggest_keywords"), reply_markup=kb)

    async def cb_suggest(update: Update, context: ContextTypes.DEFAULT_TYPE):
        q = update.callback_query
        await q.answer()
        uid = q.from_user.id
        lang = _lang(context, uid)
        _, _, term = q.data.split(":", 2)
        filters = context.user_data.get("filters") or {}
        kw = (filters.get("keywords") or "").strip()
        if kw:
            if term.lower() not in kw.lower():
                kw = kw + " " + term
        else:
            kw = term
        filters["keywords"] = kw
        context.user_data["filters"] = filters
        await q.edit_message_text(t(lang, "added_term", term=term))
        try:
            rows, total = search_jobs(filters, _active_sources(uid, context), _country(uid), results_wanted=30, offset=0)
        except Exception as e:
            await q.message.reply_text(t(lang, "err") + f"\n{e}")
            return
        if not rows:
            await q.message.reply_text(t(lang, "no_results"))
            return
        context.user_data["rows"] = rows
        save_last_results(uid, rows)
        await _show_page(uid, context, page=1)

    app.add_handler(CommandHandler("suggest", cmd_suggest))
    app.add_handler(CallbackQueryHandler(cb_suggest, pattern=r"^sg:"))

    # Toggle previews
    async def cmd_previews(update: Update, context: ContextTypes.DEFAULT_TYPE):
        uid = update.effective_user.id
        user = get_user(uid)
        new_val = not bool(user.get("previews"))
        update_user(uid, {"previews": new_val})
        lang = _lang(context, uid)
        status_label = label(lang, "on") if new_val else label(lang, "off_state")
        await update.message.reply_text(t(lang, "previews_status", status=status_label))

    app.add_handler(CommandHandler("previews", cmd_previews))
    # Muted companies management
    async def cmd_muted(update: Update, context: ContextTypes.DEFAULT_TYPE):
        uid = update.effective_user.id
        lang = _lang(context, uid)
        user = get_user(uid)
        muted = user.get("muted_companies") or []
        if not muted:
            await update.message.reply_text(t(lang, "no_muted"))
            return
        await update.message.reply_text(t(lang, "muted_list", list=", ".join(muted)))
        # Provide unmute buttons
        from telegram import InlineKeyboardMarkup, InlineKeyboardButton
        rows = []
        row = []
        for i, name in enumerate(muted, 1):
            row.append(InlineKeyboardButton(name[:24], callback_data=f"unmute:{i-1}"))
            if i % 3 == 0:
                rows.append(row)
                row = []
        if row:
            rows.append(row)
        rows.append([InlineKeyboardButton(label(lang, "none"), callback_data="unmute:clear")])
        # Telegram requires non-empty text; use an em dash placeholder
        await update.message.reply_text("—", reply_markup=InlineKeyboardMarkup(rows))

    async def cb_unmute(update: Update, context: ContextTypes.DEFAULT_TYPE):
        q = update.callback_query
        await q.answer()
        uid = q.from_user.id
        lang = _lang(context, uid)
        _, val = q.data.split(":", 1)
        user = get_user(uid)
        muted = user.get("muted_companies") or []
        if val == "clear":
            update_user(uid, {"muted_companies": []})
            await q.edit_message_text(t(lang, "muted_cleared"))
            return
        try:
            idx = int(val)
        except Exception:
            return
        if 0 <= idx < len(muted):
            name = muted[idx]
            new = [m for i, m in enumerate(muted) if i != idx]
            update_user(uid, {"muted_companies": new})
            await q.edit_message_text(t(lang, "unmuted", company=name))
            await _show_page(uid, context, page=1)

    app.add_handler(CommandHandler("muted", cmd_muted))
    app.add_handler(CallbackQueryHandler(cb_unmute, pattern=r"^unmute:"))

    # Base currency selection
    async def cmd_currency(update: Update, context: ContextTypes.DEFAULT_TYPE):
        uid = update.effective_user.id
        lang = _lang(context, uid)
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("USD", callback_data="curset:USD"), InlineKeyboardButton("EUR", callback_data="curset:EUR"), InlineKeyboardButton("GBP", callback_data="curset:GBP")],
            [InlineKeyboardButton("RUB", callback_data="curset:RUB"), InlineKeyboardButton("INR", callback_data="curset:INR"), InlineKeyboardButton("ANY", callback_data="curset:ANY")],
        ])
        await update.message.reply_text(t(lang, "choose_currency"), reply_markup=kb)

    async def cb_currency(update: Update, context: ContextTypes.DEFAULT_TYPE):
        q = update.callback_query
        await q.answer()
        uid = q.from_user.id
        lang = _lang(context, uid)
        _, val = q.data.split(":", 1)
        if val == "ANY":
            update_user(uid, {"base_currency": None})
        else:
            update_user(uid, {"base_currency": val})
        user = get_user(uid)
        ensure_rates(user)
        update_user(uid, user)
        await q.edit_message_text(t(lang, "currency_saved", currency=(val if val != "ANY" else "—")))

    app.add_handler(CommandHandler("currency", cmd_currency))
    app.add_handler(CallbackQueryHandler(cb_currency, pattern=r"^curset:"))

    # Digest inline controls (from scheduler messages)
    async def cb_digest(update: Update, context: ContextTypes.DEFAULT_TYPE):
        q = update.callback_query
        await q.answer()
        uid = q.from_user.id
        lang = _lang(context, uid)
        parts = q.data.split(":")
        if len(parts) < 3:
            return
        _, action, idx_s = parts[:3]
        try:
            idx = int(idx_s)
        except Exception:
            return
        saved = list_saved_searches(uid)
        if idx < 0 or idx >= len(saved):
            return
        entry = saved[idx]
        entry.setdefault("subs", {})
        if action == "toggle":
            entry["subs"]["paused"] = not (entry["subs"].get("paused") is True)
            update_saved_search(uid, idx, entry)
            await q.edit_message_reply_markup(reply_markup=None)
            await q.message.reply_text(t(lang, "updated"))
        elif action == "freq" and len(parts) == 4:
            freq = parts[3]
            entry["subs"]["freq"] = None if freq == 'off' else freq
            update_saved_search(uid, idx, entry)
            await q.edit_message_reply_markup(reply_markup=None)
            await q.message.reply_text(t(lang, "subs_saved", freq=freq))
        elif action == "digest":
            filters = entry.get("filters") or {}
            try:
                rows, _ = search_jobs(filters, _active_sources(uid, context), _country(uid), results_wanted=15, offset=0)
            except Exception as e:
                await q.message.reply_text(t(lang, "err") + f"\n{e}")
                return
            if not rows:
                await q.message.reply_text(t(lang, "no_results"))
                return
            await q.message.reply_text(t(lang, "digest_for", name=entry.get('name','')))
            for j in rows[:5]:
                await q.message.reply_text(f"{j.get('title')} — {j.get('company')} • {j.get('location')}\n{j.get('job_url')}", disable_web_page_preview=True)

    app.add_handler(CallbackQueryHandler(cb_digest, pattern=r"^dg:"))

    # Save search command: /save <name optional>
    async def cmd_save(update: Update, context: ContextTypes.DEFAULT_TYPE):
        uid = update.effective_user.id
        lang = _lang(context, uid)
        filters = context.user_data.get("filters") or {}
        if not filters:
            await update.message.reply_text(t(lang, "no_results"))
            return
        name = " ".join(context.args) if context.args else (
            f"Поиск {filters.get('keywords','')} {filters.get('location','')}".strip()
        )
        save_search(uid, name, filters)
        await update.message.reply_text(t(lang, "search_saved"))

    app.add_handler(CommandHandler("save", cmd_save))

    return app


def main():
    # Prevent multiple local instances
    _ensure_single_instance()

    # Preflight: check if another poller is already running for this bot token
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        print("Environment variable TELEGRAM_BOT_TOKEN is not set. Exiting.")
        sys.exit(1)

    wait_on_conflict = os.getenv("JOBSPY_BOT_WAIT_ON_CONFLICT", "0").lower() in {"1", "true", "yes"}
    if not _preflight_conflict_check(token):
        if wait_on_conflict:
            import time
            logger.info("Detected another poller. Waiting until it stops…")
            # Wait up to ~2 minutes for the other instance to stop
            deadline = time.time() + 120
            while time.time() < deadline:
                time.sleep(5)
                if _preflight_conflict_check(token):
                    break
            else:
                # Timed out waiting — exit cleanly without error
                print("Другой экземпляр бота уже запущен. Этот экземпляр завершает работу без ошибок.")
                sys.exit(0)
        else:
            # Exit cleanly and quietly if another poller is active
            print("Другой экземпляр бота уже запущен. Этот экземпляр завершает работу без ошибок.")
            sys.exit(0)

    app = build_app()

    # Global error handler for cleaner error reporting
    async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE):
        err = context.error
        if isinstance(err, Conflict) and "other getUpdates request" in str(err):
            # Graceful, non-error shutdown on 409 conflicts
            logger.info("Detected another poller. Shutting down gracefully.")
            # Stop the run_polling loop gracefully from within a handler
            try:
                context.application.stop_running()
            except Exception:
                pass
            return
        # Log any other exception
        logger.exception("Unhandled exception in handler", exc_info=err)

    app.add_error_handler(on_error)

    app.run_polling(close_loop=False, drop_pending_updates=True)


if __name__ == "__main__":
    main()
