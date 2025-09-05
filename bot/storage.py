from __future__ import annotations

import json
import os
from typing import Any, Dict, List


DB_PATH = os.path.join(os.path.dirname(__file__), "data", "db.json")


def _ensure_db_dir():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


def _default_user(uid: int) -> Dict[str, Any]:
    return {
        "lang": "ru",
        "role": "jobseeker",
        "sources": [
            "indeed",
            "linkedin",
            "google",
            "zip_recruiter",
            "glassdoor",
        ],
        "country_indeed": "usa",
        "previews": False,
        "base_currency": "USD",
        "fx_rates": {},
        "fx_ts": 0,
        "muted_companies": [],
        "notifications": True,
        "favorites": [],  # list of job dicts
        "saved_searches": [],  # list of {name, filters}
        "subs": {"freq": "daily"},  # stub
        "last_results": [],  # list of job dicts (for export)
    }


def _load_db() -> Dict[str, Any]:
    if not os.path.exists(DB_PATH):
        _ensure_db_dir()
        with open(DB_PATH, "w", encoding="utf-8") as f:
            json.dump({}, f)
    with open(DB_PATH, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}


def _save_db(db: Dict[str, Any]):
    _ensure_db_dir()
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)


def get_user(uid: int) -> Dict[str, Any]:
    db = _load_db()
    user = db.get(str(uid))
    if not user:
        user = _default_user(uid)
        db[str(uid)] = user
        _save_db(db)
    return user


def set_user(uid: int, data: Dict[str, Any]):
    db = _load_db()
    db[str(uid)] = data
    _save_db(db)


def update_user(uid: int, patch: Dict[str, Any]):
    user = get_user(uid)
    user.update(patch)
    set_user(uid, user)


def save_favorite(uid: int, job: Dict[str, Any]) -> bool:
    user = get_user(uid)
    if any(j.get("job_url") == job.get("job_url") for j in user["favorites"]):
        return False
    user["favorites"].append(job)
    set_user(uid, user)
    return True


def list_favorites(uid: int) -> List[Dict[str, Any]]:
    return get_user(uid).get("favorites", [])


def clear_favorites(uid: int):
    user = get_user(uid)
    user["favorites"] = []
    set_user(uid, user)


def export_user(uid: int) -> Dict[str, Any]:
    return get_user(uid)


def delete_user(uid: int):
    db = _load_db()
    if str(uid) in db:
        del db[str(uid)]
        _save_db(db)


def save_search(uid: int, name: str, filters: Dict[str, Any]):
    user = get_user(uid)
    # Replace by name if exists
    ss = [s for s in user["saved_searches"] if s.get("name") != name]
    # preserve existing subs if present
    existing = next((s for s in user.get("saved_searches", []) if s.get("name") == name), None)
    subs = (existing or {}).get("subs") or {}
    ss.append({"name": name, "filters": filters, "subs": subs})
    user["saved_searches"] = ss
    set_user(uid, user)


def list_saved_searches(uid: int) -> List[Dict[str, Any]]:
    return get_user(uid).get("saved_searches", [])


def update_saved_search(uid: int, idx: int, patch: Dict[str, Any]):
    user = get_user(uid)
    lst = user.get("saved_searches", [])
    if idx < 0 or idx >= len(lst):
        return
    lst[idx] = {**lst[idx], **patch}
    user["saved_searches"] = lst
    set_user(uid, user)


def save_last_results(uid: int, jobs: List[Dict[str, Any]]):
    user = get_user(uid)
    user["last_results"] = jobs
    set_user(uid, user)


def get_last_results(uid: int) -> List[Dict[str, Any]]:
    return get_user(uid).get("last_results", [])


def list_users() -> List[int]:
    db = _load_db()
    uids: List[int] = []
    for k in db.keys():
        try:
            uids.append(int(k))
        except Exception:
            continue
    return uids
