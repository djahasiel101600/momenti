#!/usr/bin/env python
"""End-to-end HTTP smoke test for the Django backend â€” the twin of
scripts/smoke-api.mjs.

Spawns `backend/manage.py runserver` against an isolated temp data dir, then
exercises the public surface over real HTTP: health/settings, register ->
OTP -> token -> me, login, invitation CRUD with the sort/filter semantics,
slug uniqueness and auth guards, both upload endpoints, the uploads
traversal guard and the password-reset flow.

    python scripts/smoke-django.py

Exits 0 when every check passes, 1 otherwise.
"""
import hashlib
import hmac
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("MOMENTI_SMOKE_PORT", "8795"))
BASE = f"http://127.0.0.1:{PORT}"

PNG_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
MP3_BYTES = b"ID3\x03\x00\x00\x00\x00\x00\x00"  # minimal "ID3" header

failures = 0


def check(label, actual, expected):
    global failures
    ok = actual == expected
    if not ok:
        failures += 1
    print(f"{'PASS' if ok else 'FAIL'}  {label}" + ("" if ok else f"  (got {actual!r}, want {expected!r})"))


def request(pathname, method="GET", body=None, token=None, raw_body=None, content_type="application/json", extra_headers=None):
    """Returns (status, parsed-json-or-None, headers)."""
    headers = {}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if raw_body is not None:
        data = raw_body
        headers["Content-Type"] = content_type
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(BASE + pathname, data=data, method=method, headers=headers)
    try:
        resp = urllib.request.urlopen(req)
    except urllib.error.HTTPError as exc:
        resp = exc
    payload = resp.read()
    parsed = None
    if payload:
        try:
            parsed = json.loads(payload.decode("utf-8"))
        except ValueError:
            parsed = None
    return resp.status, parsed, dict(resp.headers)


def wait_healthy(deadline=45.0):
    end = time.time() + deadline
    while time.time() < end:
        try:
            status, _, _ = request("/api/health")
            if status == 200:
                return True
        except OSError:
            pass
        time.sleep(0.25)
    return False


def venv_python():
    suffix = "Scripts/python.exe" if os.name == "nt" else "bin/python"
    candidate = REPO_ROOT / "backend" / ".venv" / suffix
    return str(candidate) if candidate.exists() else sys.executable


def main():
    data_dir = tempfile.mkdtemp(prefix="momenti-django-smoke-")
    env = {**os.environ, "MOMENTI_DATA_DIR": data_dir, "MOMENTI_DEBUG": "off"}
    env["MOMENTI_PAYMONGO_SECRET_KEY"] = "sk_test_smoke_dummy"
    env["MOMENTI_PAYMONGO_WEBHOOK_SECRET"] = "whsec_smoke"
    env["MOMENTI_PAYMONGO_MODE"] = "test"
    python = venv_python()
    manage_py = str(REPO_ROOT / "backend" / "manage.py")
    # Fresh data dir: apply migrations first (the Node backend creates its
    # storage on boot; Django's equivalent is `manage.py migrate`).
    subprocess.run(
        [python, manage_py, "migrate"],
        env=env,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )
    server = subprocess.Popen(
        [
            python,
            manage_py,
            "runserver",
            f"127.0.0.1:{PORT}",
            "--noreload",
        ],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )
    global failures
    try:
        if not wait_healthy():
            raise RuntimeError("server did not become healthy in time")

        # --- settings / health ----------------------------------------------------
        status, health, _ = request("/api/health")
        check("health.status", status, 200)
        check("health.service", health.get("service"), "momenti")

        status, settings, _ = request("/api/app/settings")
        check("settings.app_name", settings.get("public_settings", {}).get("app_name"), "momenti.co")

        # --- register -> OTP -> verify -> me ---------------------------------------
        status, reg, _ = request(
            "/api/auth/register",
            method="POST",
            body={"email": "smoke@test.dev", "password": "secret123"},
        )
        check("register.status", status, 201)
        check("register.otp_sent", reg.get("otp_sent"), True)
        dev_otp = reg.get("dev_otp")
        check("register.dev_otp_len", len(str(dev_otp)), 6)

        status, _, _ = request(
            "/api/auth/verify-otp",
            method="POST",
            body={"email": "smoke@test.dev", "otpCode": "000000"},
        )
        check("verify.wrong_otp_status", status, 401)

        status, ver, _ = request(
            "/api/auth/verify-otp",
            method="POST",
            body={"email": "smoke@test.dev", "otpCode": dev_otp},
        )
        check("verify.status", status, 200)
        token = ver.get("access_token", "")
        check("verify.token_present", "." in token, True)
        check("verify.email", ver.get("email"), "smoke@test.dev")
        check("verify.role", ver.get("role"), "member")

        # SaaS Phase 2: grant this user Pro so the CRUD section can create multiple invitations under quota enforcement.
        subprocess.run(
            [python, manage_py, "billing_activate", "--email", "smoke@test.dev", "--plan", "pro"],
            env=env,
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.STDOUT,
        )

        status, me, _ = request("/api/auth/me", token=token)
        check("me.status", status, 200)
        check("me.email", me.get("email"), "smoke@test.dev")

        status, _, _ = request("/api/auth/me")
        check("me.anonymous_status", status, 401)

        status, _, _ = request("/api/auth/me", token="not.a.token")
        check("me.bad_token_status", status, 401)

        status, _, _ = request(
            "/api/auth/login",
            method="POST",
            body={"email": "smoke@test.dev", "password": "wrong-password"},
        )
        check("login.wrong_password_status", status, 401)

        status, good_login, _ = request(
            "/api/auth/login",
            method="POST",
            body={"email": "smoke@test.dev", "password": "secret123"},
        )
        check("login.status", status, 200)
        check("login.token_present", "access_token" in good_login, True)

        # --- invitation CRUD + guards ------------------------------------------------
        status, _, _ = request(
            "/api/entities/invitations", method="POST", body={"slug": "x"}
        )
        check("create.anonymous_status", status, 401)

        status, _, _ = request(
            "/api/entities/invitations",
            method="POST",
            body={"slug": "x"},
            token="not.a.token",
        )
        check("create.bad_token_status", status, 401)

        status, rec_a, _ = request(
            "/api/entities/invitations",
            method="POST",
            body={"slug": "alpha-wedding", "couple": "Alpha", "eventType": "Wedding"},
            token=token,
        )
        check("create.a.status", status, 201)
        time.sleep(0.05)  # ensure distinct created_date for sort assertions
        status, rec_b, _ = request(
            "/api/entities/invitations",
            method="POST",
            body={"slug": "beta-gala", "couple": "Beta", "eventType": "Gala"},
            token=token,
        )
        check("create.b.status", status, 201)

        status, listing, _ = request("/api/entities/invitations?sort=-created_date&limit=10", token=token)
        check("list.newest_first", listing[0].get("slug") if listing else None, "beta-gala")
        check("list.count", len(listing), 2)

        status, filtered, _ = request("/api/entities/invitations?slug=beta-gala")
        check("filter.slug_only_match", len(filtered) == 1 and filtered[0].get("slug"), "beta-gala")

        status, _, _ = request(
            "/api/entities/invitations",
            method="POST",
            body={"slug": "alpha-wedding", "couple": "Dup"},
            token=token,
        )
        check("create.duplicate_slug_status", status, 409)

        status, updated, _ = request(
            f"/api/entities/invitations/{rec_b['id']}",
            method="PATCH",
            body={"couple": "Beta Prime"},
            token=token,
        )
        check("update.couple", updated.get("couple"), "Beta Prime")
        check("update.created_date_preserved", updated.get("created_date") == rec_b.get("created_date"), True)

        status, deleted, _ = request(
            f"/api/entities/invitations/{rec_b['id']}", method="DELETE", token=token
        )
        check("delete.ok", deleted.get("ok"), True)
        status, after_delete, _ = request("/api/entities/invitations?sort=-created_date", token=token)
        check("list.after_delete_count", len(after_delete), 1)

        # --- billing / quotas (SaaS Phase 2) -------------------------------------
        status, usage, _ = request("/api/billing/usage", token=token)
        check("billing.usage_status", status, 200)
        check("billing.smoke_plan", usage.get("plan", {}).get("code"), "pro")
        check("billing.usage_meters", usage.get("usage", {}).get("invitations"), 1)

        # A fresh user sits on Free (1 invitation cap) until upgraded.
        status, free_reg, _ = request(
            "/api/auth/register",
            method="POST",
            body={"email": "free@test.dev", "password": "secret123"},
        )
        free_otp = free_reg.get("dev_otp")
        status, free_ver, _ = request(
            "/api/auth/verify-otp",
            method="POST",
            body={"email": "free@test.dev", "otpCode": free_otp},
        )
        free_token = free_ver.get("access_token", "")
        status, _, _ = request(
            "/api/entities/invitations",
            method="POST",
            body={"slug": "free-one", "couple": "Free"},
            token=free_token,
        )
        check("billing.free_first_create", status, 201)
        status, over, _ = request(
            "/api/entities/invitations",
            method="POST",
            body={"slug": "free-two", "couple": "Free2"},
            token=free_token,
        )
        check("billing.free_over_cap", status, 402)
        check("billing.free_over_cap_message", "limit" in str(over.get("error", "")), True)
        status, free_usage, _ = request("/api/billing/usage", token=free_token)
        check("billing.free_plan_in_usage", free_usage.get("plan", {}).get("code"), "free")

        # --- PayMongo webhook (SaaS Phase 3) ----------------------------------
        status, wh_bad, _ = request(
            "/api/billing/webhook", method="POST", body={"data": {}},
            extra_headers={"Paymongo-Signature": "1.deadbeef"},
        )
        check("billing.webhook_bad_signature", status, 400)

        import time as _t

        def _wh_sign(body_bytes, secret):
            ts = str(int(_t.time()))
            return f"{ts}." + hmac.new(secret.encode(), (ts + ".").encode() + body_bytes, hashlib.sha256).hexdigest()

        _event = {
            "data": {
                "id": "evt_x",
                "type": "event",
                "attributes": {
                    "type": "checkout_session.payment.paid",
                    "data": {
                        "id": "cs_x",
                        "type": "checkout_session",
                        "attributes": {"reference_number": "momenti-unknown"},
                    },
                },
            }
        }
        _body = json.dumps(_event).encode("utf-8")
        _sig = _wh_sign(_body, "whsec_smoke")
        status, _, _ = request(
            "/api/billing/webhook", method="POST", raw_body=_body,
            content_type="application/json", extra_headers={"Paymongo-Signature": _sig},
        )
        check("billing.webhook_unknown_ref_ack", status, 200)

        # Checkout with a dummy key should fail cleanly provider-side (use the
        # free user — the main smoke user is already on Pro).
        status, checkout_err, _ = request(
            "/api/billing/checkout", method="POST", body={"plan": "pro"}, token=free_token
        )
        check("billing.checkout_provider_error", status, 502)
        check("billing.checkout_error_reported", bool(checkout_err.get("error")), True)

        # --- uploads ------------------------------------------------------------------
        status, uploaded, _ = request(
            "/api/uploads",
            method="POST",
            body={"filename": "dot.png", "data": PNG_DATA_URL},
            token=token,
        )
        check("upload.status", status, 201)
        file_url = uploaded.get("file_url", "")
        check("upload.file_url_prefix", file_url.startswith("/uploads/"), True)

        status, _, headers = request(file_url)
        check("upload.served_status", status, 200)
        check("upload.served_content_type", headers.get("Content-Type"), "image/png")
        check("upload.served_immutable_cache", "immutable" in headers.get("Cache-Control", ""), True)

        status, _, _ = request(
            "/api/uploads",
            method="POST",
            body={"filename": "dot.png", "data": PNG_DATA_URL},
        )
        check("upload.anonymous_status", status, 401)
        status, library, _ = request("/api/uploads?kind=image", token=token)
        check("library.list_status", status, 200)
        check("library.contains_upload", any(u.get("name") == uploaded.get("file_url", "").split("/")[-1] for u in (library or [])), True)
        status, _, _ = request("/api/uploads", token="bad-token")
        check("library.bad_token_status", status, 401)


        status, _, _ = request("/uploads/..%2Fdb.json")
        check("traversal.blocked", status in (400, 404), True)

        # --- streamed media uploads ---------------------------------------------------
        status, _, _ = request(
            "/api/uploads/stream?filename=q.mp3",
            method="PUT",
            raw_body=MP3_BYTES,
            content_type="audio/mpeg",
        )
        check("stream.anonymous_status", status, 401)

        status, streamed, _ = request(
            "/api/uploads/stream?filename=loop.mp3",
            method="PUT",
            raw_body=MP3_BYTES,
            content_type="audio/mpeg",
            token=token,
        )
        check("stream.audio.status", status, 201)
        check("stream.audio.kind", streamed.get("kind"), "audio")
        check("stream.audio.bytes", streamed.get("bytes"), len(MP3_BYTES))
        check("stream.audio.url_suffix", streamed.get("file_url", "").endswith(".mp3"), True)

        status, _, headers = request(streamed.get("file_url"))
        check("stream.served_content_type", headers.get("Content-Type"), "audio/mpeg")

        status, _, _ = request(
            "/api/uploads/stream?filename=evil.txt",
            method="PUT",
            raw_body=b"x",
            content_type="text/plain",
            token=token,
        )
        check("stream.badext_status", status, 415)

        # --- password reset ------------------------------------------------------------
        status, reset_req, _ = request(
            "/api/auth/reset-password-request", method="POST", body={"email": "smoke@test.dev"}
        )
        check("reset.request_status", status, 200)
        reset_link = reset_req.get("dev_reset_link", "")
        check("reset.link_present", "/reset-password?token=" in reset_link, True)
        reset_token = reset_link.split("token=")[-1]

        status, _, _ = request(
            "/api/auth/reset-password",
            method="POST",
            body={"resetToken": reset_token, "newPassword": "brand-new-pw"},
        )
        check("reset.confirm_status", status, 200)

        status, _, _ = request(
            "/api/auth/reset-password",
            method="POST",
            body={"resetToken": reset_token, "newPassword": "another-pass"},
        )
        check("reset.replay_status", status, 400)

        status, _, _ = request(
            "/api/auth/login",
            method="POST",
            body={"email": "smoke@test.dev", "password": "brand-new-pw"},
        )
        check("reset.login_new_password_status", status, 200)

        # --- RSVPs ----------------------------------------------------------------------
        status, rsvp, _ = request(
            "/api/rsvps",
            method="POST",
            body={
                "slug": "alpha-wedding",
                "name": "Ada Guest",
                "email": "ada@guest.dev",
                "attending": True,
                "guest_count": 3,
                "message": "Wouldn't miss it!",
            },
        )
        check("rsvp.guest_submit_status", status, 201)
        check("rsvp.invitation_resolved", rsvp.get("slug"), "alpha-wedding")
        check("rsvp.guest_count", rsvp.get("guest_count"), 3)

        status, _, _ = request(f"/api/rsvps?invitation={rec_a['id']}")
        check("rsvp.list_anonymous_status", status, 401)

        status, listed, _ = request(
            f"/api/rsvps?invitation={rec_a['id']}", token=token
        )
        check("rsvp.list_status", status, 200)
        check("rsvp.list_count", len(listed), 1)

        status, resubmit, _ = request(
            "/api/rsvps",
            method="POST",
            body={
                "slug": "alpha-wedding",
                "name": "Ada Guest",
                "email": "ada@guest.dev",
                "attending": False,
                "guest_count": 1,
            },
        )
        check("rsvp.upsert_status", status, 200)
        check("rsvp.upsert_flag", resubmit.get("updated"), True)
        check("rsvp.upsert_same_id", resubmit.get("id"), rsvp.get("id"))

        status, listed_after, _ = request(
            "/api/rsvps?slug=alpha-wedding", token=token
        )
        check("rsvp.upsert_no_duplicate", len(listed_after), 1)
        check("rsvp.upsert_latest_answer", listed_after[0].get("attending"), False)

        status, _, _ = request(
            "/api/rsvps",
            method="POST",
            body={"slug": "does-not-exist", "name": "X", "email": "x@guest.dev", "attending": True},
        )
        check("rsvp.unknown_slug_status", status, 404)
    finally:
        server.terminate()


if __name__ == "__main__":
    main()
    print(f"\n{failures} check(s) FAILED" if failures else "\nALL CHECKS PASSED")
    sys.exit(1 if failures else 0)

