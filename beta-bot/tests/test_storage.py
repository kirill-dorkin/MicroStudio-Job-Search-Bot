
from pathlib import Path

import pytest

from bot import storage


@pytest.fixture
def storage_tmp(monkeypatch, tmp_path):
    db_path = tmp_path / "db.json"
    monkeypatch.setattr(storage, "DB_PATH", str(db_path))
    monkeypatch.setattr(storage, "_BACKUP_PATH", str(tmp_path / "db.json.bak"))
    monkeypatch.setattr(storage, "_LOCK_PATH", str(tmp_path / "db.json.lock"))
    storage._ensure_db_dir()
    yield storage


def test_get_user_initializes_defaults(storage_tmp):
    user = storage_tmp.get_user(123)
    assert user["lang"] == "ru"
    assert "fx_error" in user and user["fx_error"] is None


def test_save_favorite_deduplicates(storage_tmp):
    job = {"job_url": "https://example.com/job"}
    assert storage_tmp.save_favorite(1, job) is True
    assert storage_tmp.save_favorite(1, job) is False
    favs = storage_tmp.list_favorites(1)
    assert len(favs) == 1
    assert favs[0]["job_url"] == job["job_url"]


def test_recovers_from_corrupted_db(storage_tmp, tmp_path):
    storage_tmp.get_user(1)
    storage_tmp.update_user(1, {"lang": "en"})
    # Corrupt the DB file directly
    Path(storage_tmp.DB_PATH).write_text("{" )
    recovered = storage_tmp.get_user(1)
    assert recovered["lang"] == "en"
