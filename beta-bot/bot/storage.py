
from __future__ import annotations

import json
import os
import shutil
import tempfile
import time
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List

import logging


logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "db.json")
_BACKUP_PATH = DB_PATH + ".bak"
_LOCK_PATH = DB_PATH + ".lock"
_LOCK_TIMEOUT = 5.0
_LAST_LOAD_USED_BACKUP = False


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
        "fx_error": None,
        "muted_companies": [],
        "notifications": True,
        "favorites": [],  # list of job dicts
        "saved_searches": [],  # list of {name, filters}
        "subs": {"freq": "daily"},  # stub
        "last_results": [],  # list of job dicts (for export)
    }


def _clone(data: Any) -> Any:
    return json.loads(json.dumps(data))


@contextmanager
def _acquire_lock(timeout: float = _LOCK_TIMEOUT) -> Iterator[None]:
    _ensure_db_dir()
    fh = open(_LOCK_PATH, "a+")
    start = time.monotonic()
    while True:
        try:
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except (BlockingIOError, OSError):
            if time.monotonic() - start > timeout:
                fh.close()
                raise TimeoutError("Timed out acquiring storage lock")
            time.sleep(0.1)
    try:
        yield
    finally:
        try:
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        except Exception:
            pass
        fh.close()


def _read_db_unlocked() -> Dict[str, Any]:
    global _LAST_LOAD_USED_BACKUP
    _ensure_db_dir()
    if not os.path.exists(DB_PATH):
        with open(DB_PATH, "w", encoding="utf-8") as f:
            json.dump({}, f)
        return {}
    try:
        with open(DB_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        _LAST_LOAD_USED_BACKUP = False
        return data
    except json.JSONDecodeError as exc:
        logger.warning("storage: db.json corrupted, trying backup: %s", exc)
        if os.path.exists(_BACKUP_PATH):
            try:
                with open(_BACKUP_PATH, "r", encoding="utf-8") as bf:
                    data = json.load(bf)
                _LAST_LOAD_USED_BACKUP = True
                return data
            except Exception as backup_exc:
                logger.error("storage: failed to load backup: %s", backup_exc)
        _LAST_LOAD_USED_BACKUP = False
        return {}
    except FileNotFoundError:
        _LAST_LOAD_USED_BACKUP = False
        return {}


def _write_db_unlocked(db: Dict[str, Any]) -> None:
    global _LAST_LOAD_USED_BACKUP
    _ensure_db_dir()
    serialized = json.dumps(db, ensure_ascii=False, indent=2)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=os.path.dirname(DB_PATH), delete=False
    ) as tmp:
        tmp.write(serialized)
        tmp.flush()
        os.fsync(tmp.fileno())
        temp_name = tmp.name
    try:
        shutil.copy2(temp_name, _BACKUP_PATH)
    except Exception as exc:
        logger.warning("storage: could not create backup: %s", exc)
    os.replace(temp_name, DB_PATH)
    _LAST_LOAD_USED_BACKUP = False


@contextmanager
def _mutate_db() -> Iterator[Dict[str, Any]]:
    with _acquire_lock():
        db = _read_db_unlocked()
        yield db
        _write_db_unlocked(db)


def _ensure_user_defaults(user: Dict[str, Any]) -> Dict[str, Any]:
    if "fx_error" not in user:
        user["fx_error"] = None
    return user


def get_user(uid: int) -> Dict[str, Any]:
    key = str(uid)
    with _mutate_db() as db:
        user = db.get(key)
        if not user:
            user = _default_user(uid)
            db[key] = user
        else:
            user = _ensure_user_defaults(user)
        return _clone(user)


def set_user(uid: int, data: Dict[str, Any]):
    key = str(uid)
    with _mutate_db() as db:
        db[key] = _ensure_user_defaults(_clone(data))


def update_user(uid: int, patch: Dict[str, Any]):
    key = str(uid)
    with _mutate_db() as db:
        user = db.get(key) or _default_user(uid)
        user.update(patch)
        db[key] = _ensure_user_defaults(user)


def save_favorite(uid: int, job: Dict[str, Any]) -> bool:
    key = str(uid)
    with _mutate_db() as db:
        user = db.get(key) or _default_user(uid)
        favs = user.setdefault("favorites", [])
        if any(j.get("job_url") == job.get("job_url") for j in favs):
            db[key] = _ensure_user_defaults(user)
            return False
        favs.append(job)
        db[key] = _ensure_user_defaults(user)
        return True


def list_favorites(uid: int) -> List[Dict[str, Any]]:
    return get_user(uid).get("favorites", [])


def clear_favorites(uid: int):
    update_user(uid, {"favorites": []})


def export_user(uid: int) -> Dict[str, Any]:
    return get_user(uid)


def delete_user(uid: int):
    key = str(uid)
    with _mutate_db() as db:
        if key in db:
            del db[key]


def save_search(uid: int, name: str, filters: Dict[str, Any]):
    key = str(uid)
    with _mutate_db() as db:
        user = db.get(key) or _default_user(uid)
        ss = [s for s in user.get("saved_searches", []) if s.get("name") != name]
        existing = next(
            (s for s in user.get("saved_searches", []) if s.get("name") == name),
            None,
        )
        subs = (existing or {}).get("subs") or {}
        ss.append({"name": name, "filters": filters, "subs": subs})
        user["saved_searches"] = ss
        db[key] = _ensure_user_defaults(user)


def list_saved_searches(uid: int) -> List[Dict[str, Any]]:
    return get_user(uid).get("saved_searches", [])


def update_saved_search(uid: int, idx: int, patch: Dict[str, Any]):
    key = str(uid)
    with _mutate_db() as db:
        user = db.get(key) or _default_user(uid)
        lst = user.get("saved_searches", [])
        if 0 <= idx < len(lst):
            lst[idx] = {**lst[idx], **patch}
            user["saved_searches"] = lst
            db[key] = _ensure_user_defaults(user)


def save_last_results(uid: int, jobs: List[Dict[str, Any]]):
    update_user(uid, {"last_results": jobs})


def get_last_results(uid: int) -> List[Dict[str, Any]]:
    return get_user(uid).get("last_results", [])


def list_users() -> List[int]:
    db = _read_db_unlocked()
    uids: List[int] = []
    for k in db.keys():
        try:
            uids.append(int(k))
        except Exception:
            continue
    return uids
