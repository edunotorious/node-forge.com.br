"""Outbound email — pluggable backend.

Picks delivery based on `settings.email_backend`:
  * "stdout"  — prints subject + link to the server log. Dev default; no
                external dependency, no API key required.
  * "resend"  — POSTs to https://api.resend.com/emails. Free tier covers
                100 sends/day / 3000/month, plenty for MVP. Requires
                `resend_api_key` in env.

Failures are LOGGED, NEVER RAISED. The caller is a BackgroundTask after a
204 response — we don't want a flaky email provider to flip the response
to a 5xx (which would also leak a signal about whether the user exists).
"""

from __future__ import annotations

import sys
import traceback
from urllib.parse import urlsplit

import httpx

from src.config import get_settings
from src.email.templates import render_password_reset_html

_RESEND_ENDPOINT = "https://api.resend.com/emails"
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


def _is_local_origin(url: str) -> bool:
    return (urlsplit(url).hostname or "").lower() in _LOCAL_HOSTS


async def send_password_reset(
    to_email: str,
    raw_token: str,
    locale: str = "pt-BR",
) -> None:
    settings = get_settings()
    link = f"{settings.app_base_url.rstrip('/')}/reset-password?token={raw_token}"
    subject, html, text = render_password_reset_html(locale, link)

    backend = settings.email_backend.strip().lower()
    if backend == "stdout":
        # Same shape as the prior inline print() — keeps the dev workflow
        # of "tail the backend log to grab the link" intact.
        print(
            f"[email/stdout] to={to_email} subject={subject!r} link={link}",
            flush=True,
        )
        return

    if backend == "resend":
        if _is_local_origin(settings.app_base_url):
            # Real mail with a localhost link is always a misconfiguration:
            # the recipient's browser can't reach it. Shout in the log so it
            # is caught on the first send rather than by a user.
            print(
                f"[email/resend] APP_BASE_URL is {settings.app_base_url!r} — the link in "
                "this email points at localhost and will not open for the recipient. "
                "Set APP_BASE_URL to the public origin.",
                file=sys.stderr,
                flush=True,
            )
        if not settings.resend_api_key:
            print(
                f"[email/resend] RESEND_API_KEY is empty — falling back to stdout. link={link}",
                flush=True,
            )
            return
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    _RESEND_ENDPOINT,
                    headers={
                        "Authorization": f"Bearer {settings.resend_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": settings.email_from,
                        "to": [to_email],
                        "subject": subject,
                        "html": html,
                        "text": text,
                    },
                )
            if res.status_code >= 400:
                print(
                    f"[email/resend] {res.status_code} for to={to_email}: {res.text[:500]}",
                    flush=True,
                )
            else:
                print(f"[email/resend] sent to={to_email}", flush=True)
        except (httpx.HTTPError, OSError) as exc:
            # Any provider hiccup is non-fatal for the caller — log and
            # move on. The user can retry forgot-password if no email
            # arrives.
            print(
                f"[email/resend] failed for to={to_email}: {exc}",
                file=sys.stderr,
                flush=True,
            )
            traceback.print_exc(file=sys.stderr)
        return

    print(
        f"[email] unknown backend {backend!r}; dropping send to={to_email}",
        file=sys.stderr,
        flush=True,
    )
