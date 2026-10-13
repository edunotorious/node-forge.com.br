"""Password-reset email: the link must use APP_BASE_URL, and a localhost
origin combined with real delivery must be flagged loudly in the log."""

from __future__ import annotations

import json

import httpx
import pytest

from src.config import get_settings
from src.email import sender


@pytest.fixture
def resend(monkeypatch) -> list[httpx.Request]:
    """Route the Resend call to a mock transport; returns sent requests."""
    settings = get_settings()
    monkeypatch.setattr(settings, "email_backend", "resend")
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    sent: list[httpx.Request] = []
    real_client = httpx.AsyncClient

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return httpx.Response(200, json={"id": "email_1"})

    def fake_client(*args, **kwargs):
        return real_client(*args, transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(sender.httpx, "AsyncClient", fake_client)
    return sent


async def test_reset_link_uses_public_origin(monkeypatch, resend, capsys) -> None:
    monkeypatch.setattr(get_settings(), "app_base_url", "https://node-forge.com.br/")
    await sender.send_password_reset("ana@example.com", "tok123")

    body = json.loads(resend[0].content)
    link = "https://node-forge.com.br/reset-password?token=tok123"
    assert link in body["html"]
    assert link in body["text"]
    assert "localhost" not in capsys.readouterr().err


@pytest.mark.parametrize("origin", ["http://localhost:3000", "http://127.0.0.1:3000"])
async def test_localhost_origin_with_real_delivery_is_flagged(
    monkeypatch, resend, capsys, origin: str
) -> None:
    monkeypatch.setattr(get_settings(), "app_base_url", origin)
    await sender.send_password_reset("ana@example.com", "tok123")

    assert "points at localhost" in capsys.readouterr().err
    # Still sent: the log is an alarm, not a behaviour change.
    assert len(resend) == 1


async def test_stdout_backend_does_not_flag_localhost(monkeypatch, capsys) -> None:
    monkeypatch.setattr(get_settings(), "email_backend", "stdout")
    monkeypatch.setattr(get_settings(), "app_base_url", "http://localhost:3000")
    await sender.send_password_reset("ana@example.com", "tok123")

    out = capsys.readouterr()
    assert "http://localhost:3000/reset-password?token=tok123" in out.out
    assert "points at localhost" not in out.err
