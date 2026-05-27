# ruff: noqa: E501
# Inline HTML with explicit styles blows past the 100-col line cap. We
# don't reformat email markup because mail clients ignore newlines
# inconsistently — keep each tag on one line for predictability.
"""Inline HTML email templates.

Why inline styles
-----------------
Email clients strip <style> tags inconsistently (Gmail keeps them, Outlook
re-renders, Apple Mail varies). Every visual property has to live in a
`style="…"` attribute on its element. We keep the look minimal —
NODE FORGE wordmark, a paragraph, the orange pill CTA — so that even in
the worst client the email is still legible plain text.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ResetCopy:
    """Localised strings for the password-reset email."""

    subject: str
    greeting: str
    body_html: str
    cta_label: str
    disclaimer: str


_COPY: dict[str, ResetCopy] = {
    "pt-BR": ResetCopy(
        subject="Recuperação de senha — Node-Forge",
        greeting="Olá!",
        body_html=(
            "Recebemos um pedido para redefinir a senha da sua conta no "
            "<strong>Node-Forge</strong>. Clique no botão abaixo para "
            "escolher uma nova senha. O link expira em 1 hora e só pode "
            "ser usado uma vez."
        ),
        cta_label="Redefinir senha",
        disclaimer=(
            "Se você não pediu essa redefinição, pode ignorar este email "
            "— ninguém entrou na sua conta."
        ),
    ),
    "en": ResetCopy(
        subject="Password reset — Node-Forge",
        greeting="Hi!",
        body_html=(
            "We received a request to reset your <strong>Node-Forge</strong> "
            "password. Click the button below to pick a new one. The link "
            "expires in 1 hour and can only be used once."
        ),
        cta_label="Reset password",
        disclaimer=(
            "If you didn't request this, you can safely ignore this email "
            "— nobody signed in to your account."
        ),
    ),
}


def pick_locale(accept_language: str | None) -> str:
    """Crude Accept-Language → supported-locale match. Anything that
    doesn't start with `en` defaults to pt-BR (Brazil-first product)."""
    if not accept_language:
        return "pt-BR"
    first = accept_language.split(",")[0].strip().lower()
    if first.startswith("en"):
        return "en"
    return "pt-BR"


def render_password_reset_html(locale: str, link: str) -> tuple[str, str, str]:
    """Returns (subject, html_body, text_body). Plain-text fallback is
    important for clients that block HTML by default."""
    copy = _COPY.get(locale, _COPY["pt-BR"])

    html = f"""\
<!doctype html>
<html lang="{locale}">
<body style="margin:0;padding:0;background:#E8E8E8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0C1532;">
  <div style="max-width:540px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <span style="font-size:28px;font-weight:900;letter-spacing:-0.02em;color:#0C1532;">NODE</span>
      <span style="font-size:28px;font-weight:900;color:#F08230;">&nbsp;FORGE&nbsp;</span>
    </div>
    <p style="font-size:18px;line-height:1.5;margin:0 0 16px;">{copy.greeting}</p>
    <p style="font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 28px;">{copy.body_html}</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="{link}"
         style="display:inline-block;padding:14px 36px;background:#F08230;color:#ffffff;text-decoration:none;border-radius:9999px;font-weight:700;font-size:16px;">
        {copy.cta_label}
      </a>
    </div>
    <p style="font-size:12px;line-height:1.5;color:#6b7280;margin:32px 0 0;">{copy.disclaimer}</p>
    <p style="font-size:11px;color:#9ca3af;margin:16px 0 0;word-break:break-all;">
      {link}
    </p>
  </div>
</body>
</html>"""

    text = (
        f"{copy.greeting}\n\n"
        + copy.body_html.replace("<strong>", "").replace("</strong>", "")
        + f"\n\n{copy.cta_label}: {link}\n\n{copy.disclaimer}\n"
    )

    return copy.subject, html, text
