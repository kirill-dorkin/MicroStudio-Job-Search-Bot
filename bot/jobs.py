from __future__ import annotations

from datetime import datetime
from typing import Dict, Any, List, Tuple

import pandas as pd

from jobspy import scrape_jobs
from urllib.parse import urlparse


DEFAULT_SOURCES = [
    "indeed",
    "linkedin",
    "google",
    "zip_recruiter",
    "glassdoor",
]


def _str_clean(v: Any) -> str:
    """Return safe string. Treat None/NaN as empty string; cast others to str."""
    try:
        if v is None:
            return ""
        if isinstance(v, str):
            return v
        if pd.isna(v):  # type: ignore[arg-type]
            return ""
        return str(v)
    except Exception:
        try:
            return str(v) if v is not None else ""
        except Exception:
            return ""


def _to_int_safe(v: Any) -> int | None:
    """Best-effort conversion of numeric-like values to int.
    Returns None for None/empty/NaN or on failure.
    """
    try:
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        f = float(v)
        if pd.isna(f):
            return None
        return int(f)
    except Exception:
        return None


def _salary_str(row: Dict[str, Any]) -> str:
    min_a = _to_int_safe(row.get("min_amount"))
    max_a = _to_int_safe(row.get("max_amount"))
    def _clean_str(v: Any) -> str:
        try:
            return "" if v is None or pd.isna(v) else str(v)
        except Exception:
            return str(v) if v is not None else ""
    currency = _clean_str(row.get("currency"))
    interval = _clean_str(row.get("interval"))
    if (min_a is not None) or (max_a is not None):
        if (min_a is not None) and (max_a is not None):
            return f"{min_a}–{max_a} {currency}/{interval}"
        v = min_a if min_a is not None else max_a
        return f"{v} {currency}/{interval}"
    return "—"


def _remote_str(val: Any) -> str:
    if val is True:
        return "Удалённо"
    if val is False:
        return "Офис/Гибрид"
    return "—"


def search_jobs(
    filters: Dict[str, Any],
    sources: List[str] | None,
    country_indeed: str | None,
    results_wanted: int = 25,
    offset: int = 0,
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Run JobSpy search, return list of dicts (normalized) and total count estimate.
    """
    site_name = sources or DEFAULT_SOURCES
    try:
        df: pd.DataFrame = scrape_jobs(
            site_name=site_name,
            search_term=filters.get("keywords"),
            google_search_term=None,  # we stick to search_term for now
            location=filters.get("location"),
            distance=filters.get("distance") or 50,
            is_remote=(filters.get("remote") is True),
            job_type=filters.get("job_type"),
            easy_apply=None,
            results_wanted=results_wanted,
            country_indeed=(country_indeed or "usa"),
            description_format="markdown",
            linkedin_fetch_description=False,
            offset=offset,
            hours_old=filters.get("hours_old"),
            enforce_annual_salary=True,
            verbose=0,
        )
    except Exception as e:
        raise RuntimeError(f"JobSpy search failed: {e}")

    if df is None or df.empty:
        return [], 0

    # Normalize
    rows: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        title = _str_clean(r.get("title")) or "—"
        company = _str_clean(r.get("company")) or "—"
        location = _str_clean(r.get("location")) or "—"
        site = _str_clean(r.get("site")) or "—"
        job_url_raw = _str_clean(r.get("job_url_direct")) or _str_clean(r.get("job_url")) or ""
        # canonicalize url (scheme+host+path; strip query/frag; normalize www)
        def canonical_url(u: Any) -> str:
            try:
                if not isinstance(u, str):
                    return ""
                if not u:
                    return ""
                p = urlparse(u)
                host = (p.netloc or "").lower()
                if host.startswith("www."):
                    host = host[4:]
                return f"{p.scheme}://{host}{p.path}"
            except Exception:
                return ""
        job_url = canonical_url(job_url_raw)
        date_posted = r.get("date_posted")
        try:
            dp = _str_clean(date_posted)
            date_str = datetime.strptime(dp, "%Y-%m-%d").strftime("%d.%m.%Y") if dp else "—"
        except Exception:
            dp = _str_clean(date_posted)
            date_str = dp if dp else "—"

        job_type = _str_clean(r.get("job_type")) or "—"
        remote = _remote_str(r.get("is_remote"))
        # Sanitize numeric fields to avoid NaN -> int errors downstream
        min_amount = _to_int_safe(r.get("min_amount"))
        max_amount = _to_int_safe(r.get("max_amount"))
        salary = _salary_str({
            "min_amount": min_amount,
            "max_amount": max_amount,
            "currency": r.get("currency"),
            "interval": r.get("interval"),
        })
        descr = _str_clean(r.get("description"))
        descr_short = (descr[:280] + "…") if descr and len(descr) > 300 else descr

        rows.append(
            {
                "title": title,
                "company": company,
                "location": location,
                "site": site,
                "date_posted": date_str,
                "job_type": job_type,
                "remote": remote,
                "remote_bool": True if r.get("is_remote") is True else False if r.get("is_remote") is False else None,
                "salary": salary,
                "min_amount": min_amount,
                "max_amount": max_amount,
                "currency": r.get("currency") if (r.get("currency") is not None and not pd.isna(r.get("currency"))) else "",
                "interval": r.get("interval") if (r.get("interval") is not None and not pd.isna(r.get("interval"))) else "",
                "job_url": job_url,
                "job_url_raw": job_url_raw,
                "description": descr_short,
            }
        )

    # Deduplicate results by job_url, then by title+company+location
    seen_urls = set()
    deduped: List[Dict[str, Any]] = []
    for r in rows:
        url = (r.get("job_url") or "").strip()
        key2 = (r.get("title"), r.get("company"), r.get("location"))
        if url:
            if url in seen_urls:
                continue
            seen_urls.add(url)
            deduped.append(r)
        else:
            # Fallback dedup key
            if not any((x.get("title"), x.get("company"), x.get("location")) == key2 for x in deduped):
                deduped.append(r)

    total = len(deduped)
    return deduped, total
