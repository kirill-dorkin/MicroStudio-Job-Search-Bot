
import pytest
from requests import RequestException

from bot import fx


class DummyResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def test_fetch_rates_success(monkeypatch):
    monkeypatch.setattr(fx.requests, "get", lambda *args, **kwargs: DummyResponse({"rates": {"usd": 1, "eur": "0.9"}}))
    rates = fx.fetch_rates("usd")
    assert rates["EUR"] == pytest.approx(0.9)


def test_fetch_rates_request_error(monkeypatch):
    def _raise(*args, **kwargs):
        raise RequestException("boom")

    monkeypatch.setattr(fx.requests, "get", _raise)
    with pytest.raises(fx.FxFetchError):
        fx.fetch_rates("usd")


def test_ensure_rates_failure_sets_flag(monkeypatch):
    def _raise(base):
        raise fx.FxFetchError("boom")

    monkeypatch.setattr(fx, "fetch_rates", _raise)
    user = {"base_currency": "USD", "fx_rates": {}, "fx_ts": 0}
    result = fx.ensure_rates(user)
    assert result == {}
    assert user["fx_error"] == "boom"


def test_ensure_rates_success_clears_flag(monkeypatch):
    monkeypatch.setattr(fx, "fetch_rates", lambda base: {"USD": 1.0})
    user = {"base_currency": "USD", "fx_rates": {}, "fx_ts": 0, "fx_error": "old"}
    result = fx.ensure_rates(user)
    assert result["USD"] == 1.0
    assert "fx_error" not in user or user["fx_error"] is None
