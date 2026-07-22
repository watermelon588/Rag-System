"""Outbound email (SMTP).

Used to deliver footer feedback straight to the product inbox. Sending is
strictly best-effort: a missing password, a refused login or an unreachable
SMTP host is logged and swallowed, because losing an email must never turn a
user's feedback submission into an error — the message is already persisted
in MongoDB regardless.

Gmail note: `SMTP_PASSWORD` must be a 16-character **App Password**
(Google Account → Security → 2-Step Verification → App passwords), not the
account's normal login password.
"""

from __future__ import annotations

import smtplib
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from html import escape
from pathlib import Path

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# The black-tile logo — emails can't rely on the client compositing PNG alpha,
# so the opaque variant is the safe one to embed.
LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "logo4.png"


def send_feedback_email(
    *, message: str, reply_to: str | None, user_label: str | None
) -> bool:
    """Email one feedback submission. Returns True when it was actually sent."""
    settings = get_settings()
    if not settings.email_configured:
        logger.info("Email not configured (SMTP_USER/SMTP_PASSWORD unset) — skipping send")
        return False

    recipient = settings.feedback_to_email or settings.smtp_user
    sender_label = formataddr((settings.mail_from_name, settings.smtp_user))

    mail = EmailMessage()
    mail["Subject"] = f"[{settings.mail_from_name}] New feedback"
    mail["From"] = sender_label
    mail["To"] = recipient
    if reply_to:
        # Lets you hit Reply and answer the submitter directly.
        mail["Reply-To"] = reply_to

    who = user_label or "Anonymous visitor"
    contact = reply_to or "not provided"

    mail.set_content(
        f"New feedback via the {settings.mail_from_name} site\n\n"
        f"From: {who}\n"
        f"Contact: {contact}\n\n"
        f"{message}\n"
    )

    logo_cid = make_msgid()[1:-1]  # strip the surrounding <>
    mail.add_alternative(
        _html_body(
            app_name=settings.mail_from_name,
            who=who,
            contact=contact,
            message=message,
            logo_cid=logo_cid,
        ),
        subtype="html",
    )

    _attach_logo(mail, logo_cid)

    try:
        _deliver(mail, settings)
    except Exception as exc:  # noqa: BLE001 — never fail the user's request
        logger.warning("Feedback email could not be sent: %s", exc)
        return False

    logger.info("Feedback email delivered to %s", recipient)
    return True


# ------------------------------------------------------------------ internals

def _deliver(mail: EmailMessage, settings) -> None:
    if settings.smtp_port == 465:
        with smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds
        ) as server:
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(mail)
        return

    with smtplib.SMTP(
        settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds
    ) as server:
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(mail)


def _attach_logo(mail: EmailMessage, logo_cid: str) -> None:
    """Embed the logo inline so it renders without remote-image warnings."""
    try:
        data = LOGO_PATH.read_bytes()
    except OSError as exc:
        logger.debug("Email logo unavailable (%s): %s", LOGO_PATH, exc)
        return
    html_part = mail.get_payload()[-1]
    html_part.add_related(data, maintype="image", subtype="png", cid=f"<{logo_cid}>")


def _html_body(*, app_name: str, who: str, contact: str, message: str, logo_cid: str) -> str:
    """Dark, brand-consistent email matching the product's monochrome UI."""
    body = escape(message).replace("\n", "<br />")
    return f"""\
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#000000;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#000000;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="max-width:560px;background:#0a0b0d;border:1px solid rgba(255,255,255,0.16);
                        border-radius:16px;overflow:hidden;
                        font-family:Inter,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding:28px 32px 20px;border-bottom:1px solid rgba(255,255,255,0.10);">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:12px;">
                      <img src="cid:{logo_cid}" width="40" height="40" alt="{escape(app_name)}"
                           style="display:block;width:40px;height:40px;border-radius:12px;
                                  border:1px solid rgba(255,255,255,0.18);" />
                    </td>
                    <td>
                      <span style="font-size:20px;font-weight:600;color:#ffffff;
                                   letter-spacing:0.005em;">{escape(app_name)}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 32px 8px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.1em;
                          text-transform:uppercase;color:rgba(255,255,255,0.35);">
                  New feedback
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 22px;">
                <div style="background:rgba(255,255,255,0.05);
                            border:1px solid rgba(255,255,255,0.10);border-radius:12px;
                            padding:18px 20px;font-size:15px;line-height:1.65;
                            color:rgba(255,255,255,0.92);">
                  {body}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 30px;font-size:13px;color:rgba(255,255,255,0.45);
                         line-height:1.7;">
                <strong style="color:rgba(255,255,255,0.70);font-weight:600;">From:</strong>
                {escape(who)}<br />
                <strong style="color:rgba(255,255,255,0.70);font-weight:600;">Contact:</strong>
                {escape(contact)}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 22px;border-top:1px solid rgba(255,255,255,0.10);
                         font-size:11px;color:rgba(255,255,255,0.28);">
                Sent automatically by {escape(app_name)}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""
