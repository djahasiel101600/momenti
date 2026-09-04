"""End-to-end API tests — the Django twin of scripts/smoke-api.mjs.

Exercises the whole public surface: health/settings, register -> OTP ->
token -> me, login, invitation CRUD with the sort/filter semantics, slug
uniqueness and auth guards, both upload endpoints, the uploads traversal
guard, and the password-reset flow.
"""
import hashlib
import hmac
import json
import tempfile
import time
import uuid
from unittest import mock
from pathlib import Path

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from core.auth import issue_token
import core.paymongo as paymongo_mod
from core.models import Invitation, PendingCheckout, Plan, Template, User

PNG_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
MP3_BYTES = b"ID3\x03\x00\x00\x00\x00\x00\x00"  # minimal "ID3" header

EMAIL_TEST_SETTINGS = {
    "MOMENTI_EMAIL_HOST": "smtp.test.dev",
    "EMAIL_BACKEND": "django.core.mail.backends.locmem.EmailBackend",
    "MOMENTI_DEV_HELPERS": False,
}

_TEST_THROTTLES = {
    "REST_FRAMEWORK": {
        "DEFAULT_AUTHENTICATION_CLASSES": ["core.auth.BearerAuthentication"],
        "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
        "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
        "DEFAULT_PARSER_CLASSES": ["core.parsers.MomentiJSONParser"],
        "EXCEPTION_HANDLER": "core.exceptions.momenti_exception_handler",
        "DEFAULT_THROTTLE_CLASSES": [
            "rest_framework.throttling.AnonRateThrottle",
            "rest_framework.throttling.UserRateThrottle",
        ],
        # Keep throttling installed (so tests exercise that code path) but
        # with a ceiling high enough that the suite never trips a 429.
        "DEFAULT_THROTTLE_RATES": {
            "anon": "10000/hour",
            "user": "10000/hour",
            "otp": "10000/hour",
            "rsvp": "10000/hour",
        },
    },
}

@override_settings(MEDIA_ROOT=Path(tempfile.mkdtemp(prefix="momenti-test-media-")))
@override_settings(MOMENTI_QUOTA_ENFORCEMENT=False)
@override_settings(**_TEST_THROTTLES)
class MomentiApiTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        # Reset DRF's cached throttle classes per-view.
        from rest_framework.views import APIView
        APIView.throttle_classes = []
        self.client = APIClient()

    def _auth_header(self, token):
        return {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    def _register_and_verify(self, email="smoke@test.dev", password="secret123"):
        reg = self.client.post(
            "/api/auth/register", {"email": email, "password": password}, format="json"
        )
        self.assertEqual(reg.status_code, 201, reg.content)
        self.assertTrue(reg.json()["otp_sent"])
        otp = reg.json()["dev_otp"]
        self.assertEqual(len(otp), 6)
        ver = self.client.post(
            "/api/auth/verify-otp", {"email": email, "otpCode": otp}, format="json"
        )
        self.assertEqual(ver.status_code, 200, ver.content)
        data = ver.json()
        self.assertIn(".", data["access_token"])
        self.assertEqual(data["email"], email)
        self.assertEqual(data["role"], "member")
        return data

    # --- settings / health ----------------------------------------------------

    def test_health_and_settings(self):
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["service"], "momenti")
        settings_resp = self.client.get("/api/app/settings")
        self.assertEqual(settings_resp.status_code, 200)
        self.assertEqual(settings_resp.json()["public_settings"]["app_name"], "momenti.co")

    # --- register / verify / me / login ---------------------------------------

    def test_register_verify_me_flow(self):
        data = self._register_and_verify()
        me = self.client.get("/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {data['access_token']}")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["email"], "smoke@test.dev")
        self.assertEqual(me.json()["role"], "member")

        # Anonymous /me is 401, like Node's requireUser.
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
        # Bad token is 401 too.
        bad = self.client.get("/api/auth/me", HTTP_AUTHORIZATION="Bearer not.a.token")
        self.assertEqual(bad.status_code, 401)

    def test_wrong_otp_rejected(self):
        self.client.post(
            "/api/auth/register",
            {"email": "smoke@test.dev", "password": "secret123"},
            format="json",
        )
        bad = self.client.post(
            "/api/auth/verify-otp", {"email": "smoke@test.dev", "otpCode": "000000"}, format="json"
        )
        self.assertEqual(bad.status_code, 401)

    def test_verify_alias_route(self):
        reg = self.client.post(
            "/api/auth/register", {"email": "alias@test.dev", "password": "secret123"}, format="json"
        )
        ver = self.client.post(
            "/api/auth/register/verify",
            {"email": "alias@test.dev", "otpCode": reg.json()["dev_otp"]},
            format="json",
        )
        self.assertEqual(ver.status_code, 200)

    def test_login_flow(self):
        self._register_and_verify()
        wrong = self.client.post(
            "/api/auth/login", {"email": "smoke@test.dev", "password": "wrong-password"}, format="json"
        )
        self.assertEqual(wrong.status_code, 401)
        good = self.client.post(
            "/api/auth/login", {"email": "smoke@test.dev", "password": "secret123"}, format="json"
        )
        self.assertEqual(good.status_code, 200)
        self.assertIn("access_token", good.json())

    def test_login_alias_route(self):
        self._register_and_verify(email="alias-login@test.dev")
        resp = self.client.post(
            "/api/auth/login-with-email-password",
            {"email": "alias-login@test.dev", "password": "secret123"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

    def test_logout_acknowledges(self):
        resp = self.client.post("/api/auth/logout")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["ok"])

    def test_resend_invalidates_old_otp(self):
        self.client.post(
            "/api/auth/register", {"email": "resend@test.dev", "password": "secret123"}, format="json"
        )
        first = self.client.post("/api/auth/resend-otp", {"email": "resend@test.dev"}, format="json")
        second = self.client.post("/api/auth/resend-otp", {"email": "resend@test.dev"}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        stale = self.client.post(
            "/api/auth/verify-otp",
            {"email": "resend@test.dev", "otpCode": first.json()["dev_otp"]},
            format="json",
        )
        self.assertEqual(stale.status_code, 401)
        fresh = self.client.post(
            "/api/auth/verify-otp",
            {"email": "resend@test.dev", "otpCode": second.json()["dev_otp"]},
            format="json",
        )
        self.assertEqual(fresh.status_code, 200)

    # --- invitation CRUD + guards ----------------------------------------------

    def test_invitation_crud_and_guards(self):
        token = self._register_and_verify()["access_token"]
        headers = self._auth_header(token)

        anon = self.client.post("/api/entities/invitations", {"slug": "x"}, format="json")
        self.assertEqual(anon.status_code, 401)
        fake = self.client.post(
            "/api/entities/invitations",
            {"slug": "x"},
            format="json",
            HTTP_AUTHORIZATION="Bearer not.a.token",
        )
        self.assertEqual(fake.status_code, 401)

        rec_a = self.client.post(
            "/api/entities/invitations",
            {"slug": "alpha-wedding", "couple": "Alpha", "eventType": "Wedding"},
            format="json",
            **headers,
        )
        self.assertEqual(rec_a.status_code, 201)
        time.sleep(0.02)  # ensure distinct created_date for sort assertions
        rec_b = self.client.post(
            "/api/entities/invitations",
            {"slug": "beta-gala", "couple": "Beta", "eventType": "Gala"},
            format="json",
            **headers,
        )
        self.assertEqual(rec_b.status_code, 201)

        listing = self.client.get("/api/entities/invitations?sort=-created_date&limit=10", **headers)
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.json()[0]["slug"], "beta-gala")
        self.assertEqual(len(listing.json()), 2)

        # Anonymous list without a slug is now 401 (tenancy): the public page
        # always filters by slug, which we cover below.
        anon_list = self.client.get("/api/entities/invitations?sort=-created_date")
        self.assertEqual(anon_list.status_code, 401)

        # Public read by slug works for published invitations (guest lookups).
        public_slug = self.client.get("/api/entities/invitations?slug=beta-gala")
        self.assertEqual(public_slug.status_code, 200)
        self.assertEqual(len(public_slug.json()), 1)
        self.assertEqual(public_slug.json()[0]["slug"], "beta-gala")

        # Tenancy isolation: a second user cannot see the first user's studio
        # listing, nor read/update/delete their invitations by id (404).
        other = self._register_and_verify(email="other@test.dev")["access_token"]
        other_h = self._auth_header(other)
        cross_list = self.client.get("/api/entities/invitations?sort=-created_date", **other_h)
        self.assertEqual(cross_list.status_code, 200)
        self.assertEqual(len(cross_list.json()), 0)

        cross_get = self.client.get(f"/api/entities/invitations/{rec_b.json()['id']}", **other_h)
        self.assertEqual(cross_get.status_code, 404)
        cross_patch = self.client.patch(
            f"/api/entities/invitations/{rec_b.json()['id']}", {"couple": "Hijack"}, format="json", **other_h
        )
        self.assertEqual(cross_patch.status_code, 404)
        cross_del = self.client.delete(f"/api/entities/invitations/{rec_b.json()['id']}", **other_h)
        self.assertEqual(cross_del.status_code, 404)

        # Drafts are hidden from guests (public slug read 404, RSVP blocked).
        self.client.patch(
            f"/api/entities/invitations/{rec_b.json()['id']}",
            {"status": "draft"},
            format="json",
            **headers,
        )
        guest_draft = self.client.get("/api/entities/invitations?slug=beta-gala")
        self.assertEqual(len(guest_draft.json()), 0)
        rsvp_draft = self.client.post(
            "/api/rsvps",
            {"slug": "beta-gala", "name": "X", "email": "x@x.dev", "attending": True},
            format="json",
        )
        self.assertEqual(rsvp_draft.status_code, 404)
        # back to published for the rest of the test
        self.client.patch(
            f"/api/entities/invitations/{rec_b.json()['id']}",
            {"status": "published"},
            format="json",
            **headers,
        )

        dupe = self.client.post(
            "/api/entities/invitations",
            {"slug": "alpha-wedding", "couple": "Dup"},
            format="json",
            **headers,
        )
        self.assertEqual(dupe.status_code, 409)

        updated = self.client.patch(
            f"/api/entities/invitations/{rec_b.json()['id']}",
            {"couple": "Beta Prime"},
            format="json",
            **headers,
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["couple"], "Beta Prime")
        self.assertEqual(updated.json()["created_date"], rec_b.json()["created_date"])

        deleted = self.client.delete(f"/api/entities/invitations/{rec_b.json()['id']}", **headers)
        self.assertEqual(deleted.status_code, 200)
        self.assertTrue(deleted.json()["ok"])
        remaining = self.client.get("/api/entities/invitations?sort=-created_date", **headers)
        self.assertEqual(len(remaining.json()), 1)

        # PUT/PATCH/DELETE on the collection are 405 (after auth), like Node.
        method_guard = self.client.patch("/api/entities/invitations", {}, format="json", **headers)
        self.assertEqual(method_guard.status_code, 405)

    def test_detail_404s(self):
        token = self._register_and_verify()["access_token"]
        headers = self._auth_header(token)
        missing_id = str(uuid.uuid4())
        for method, path in (
            ("get", f"/api/entities/invitations/{missing_id}"),
            ("patch", f"/api/entities/invitations/{missing_id}"),
            ("delete", f"/api/entities/invitations/{missing_id}"),
        ):
            if method == "patch":
                resp = self.client.patch(path, {}, format="json", **headers)
            else:
                resp = getattr(self.client, method)(path, **headers)
            self.assertEqual(resp.status_code, 404)
        garbage = self.client.get("/api/entities/invitations/not-a-uuid", **headers)
        self.assertEqual(garbage.status_code, 404)

    def test_flat_record_roundtrip_and_array_filter_fallback(self):
        token = self._register_and_verify()["access_token"]
        headers = self._auth_header(token)
        payload = {
            "slug": "media-invite",
            "couple": "M & V",
            "eventType": "Wedding",
            "heroImage": "/uploads/hero-wide.mp4",
            "heroImageMobile": "/uploads/hero-mobile.jpg",
            "tags": ["outdoor", "evening"],
            "sections": [{"id": "gallery", "label": "Gallery", "visible": True}],
            "gallery": [{"url": "/uploads/clip.mp4", "alt": "highlight reel", "span": "wide"}],
            "loopTransition": "fade",
            "music": {"url": "/uploads/loop.mp3", "autoplay": False},
            "theme": {"textColor": "#F2F0ED", "paperColor": "#F2F0ED", "displayFont": "serif"},
        }
        created = self.client.post("/api/entities/invitations", payload, format="json", **headers)
        self.assertEqual(created.status_code, 201)
        record = created.json()
        self.assertEqual(record["owner_email"], "smoke@test.dev")
        self.assertEqual(record["heroImageMobile"], "/uploads/hero-mobile.jpg")
        self.assertEqual(record["loopTransition"], "fade")
        self.assertIn("created_date", record)
        self.assertIn("updated_date", record)
        self.assertEqual(record["music"]["autoplay"], False)

        fetched = self.client.get("/api/entities/invitations?slug=media-invite")
        self.assertEqual(fetched.json()[0]["theme"]["displayFont"], "serif")

        # studio-owned listing sees it too
        owner_list = self.client.get("/api/entities/invitations?slug=media-invite", **headers)
        self.assertEqual(len(owner_list.json()), 1)

        # Primitive-array membership via the Node-parity fallback path: the
        # ORM exact-match finds nothing (tags is a list), so the verifier
        # replicates Node's String(element) === value scan.
        by_tag = self.client.get("/api/entities/invitations?tags=outdoor", **headers)
        self.assertEqual(len(by_tag.json()), 1)
        self.assertEqual(by_tag.json()[0]["slug"], "media-invite")

        # Arrays of objects never string-match in Node ("[object Object]").
        by_gallery = self.client.get("/api/entities/invitations?gallery=/uploads/clip.mp4", **headers)
        self.assertEqual(len(by_gallery.json()), 0)

    # --- uploads -----------------------------------------------------------------

    def test_base64_image_upload_and_serving(self):
        token = self._register_and_verify()["access_token"]
        headers = self._auth_header(token)

        uploaded = self.client.post(
            "/api/uploads",
            {"filename": "dot.png", "data": PNG_DATA_URL},
            format="json",
            **headers,
        )
        self.assertEqual(uploaded.status_code, 201)
        file_url = uploaded.json()["file_url"]
        self.assertTrue(file_url.startswith("/uploads/"))

        served = self.client.get(file_url)
        self.assertEqual(served.status_code, 200)
        self.assertEqual(served.headers["Content-Type"], "image/png")
        self.assertIn("immutable", served.headers["Cache-Control"])

        anon = self.client.post(
            "/api/uploads", {"filename": "dot.png", "data": PNG_DATA_URL}, format="json"
        )
        self.assertEqual(anon.status_code, 401)

        non_image = self.client.post(
            "/api/uploads",
            {"filename": "song.mp3", "data": "data:audio/mpeg;base64,SUQz"},
            format="json",
            **headers,
        )
        self.assertEqual(non_image.status_code, 415)

    def test_traversal_guard(self):
        traversal = self.client.get("/uploads/..%2Fdb.json")
        self.assertIn(traversal.status_code, (400, 404))

    def test_stream_upload(self):
        token = self._register_and_verify()["access_token"]
        headers = self._auth_header(token)

        anon = self.client.put(
            "/api/uploads/stream?filename=q.mp3",
            data=MP3_BYTES,
            content_type="audio/mpeg",
        )
        self.assertEqual(anon.status_code, 401)

        streamed = self.client.put(
            "/api/uploads/stream?filename=loop.mp3",
            data=MP3_BYTES,
            content_type="audio/mpeg",
            **headers,
        )
        self.assertEqual(streamed.status_code, 201)
        body = streamed.json()
        self.assertEqual(body["kind"], "audio")
        self.assertEqual(body["bytes"], len(MP3_BYTES))
        self.assertTrue(body["file_url"].endswith(".mp3"))

        served = self.client.get(body["file_url"])
        self.assertEqual(served.status_code, 200)
        self.assertEqual(served.headers["Content-Type"], "audio/mpeg")

        bad_ext = self.client.put(
            "/api/uploads/stream?filename=evil.txt", data=b"x", content_type="text/plain", **headers
        )
        self.assertEqual(bad_ext.status_code, 415)

        empty = self.client.put(
            "/api/uploads/stream?filename=quiet.mp3", data=b"", content_type="audio/mpeg", **headers
        )
        self.assertEqual(empty.status_code, 400)

    # --- password reset ------------------------------------------------------------

    def test_password_reset_flow(self):
        self._register_and_verify(email="reset@test.dev")
        request = self.client.post(
            "/api/auth/reset-password-request", {"email": "reset@test.dev"}, format="json"
        )
        self.assertEqual(request.status_code, 200)
        link = request.json()["dev_reset_link"]
        self.assertIn("/reset-password?token=", link)
        token = link.split("token=")[-1]

        short = self.client.post(
            "/api/auth/reset-password",
            {"resetToken": token, "newPassword": "short"},
            format="json",
        )
        self.assertEqual(short.status_code, 400)

        confirm = self.client.post(
            "/api/auth/reset-password",
            {"resetToken": token, "newPassword": "brand-new-pw"},
            format="json",
        )
        self.assertEqual(confirm.status_code, 200)
        self.assertTrue(confirm.json()["ok"])

        # Token is single-use.
        replay = self.client.post(
            "/api/auth/reset-password",
            {"resetToken": token, "newPassword": "another-pass"},
            format="json",
        )
        self.assertEqual(replay.status_code, 400)

        login_old = self.client.post(
            "/api/auth/login", {"email": "reset@test.dev", "password": "secret123"}, format="json"
        )
        self.assertEqual(login_old.status_code, 401)
        login_new = self.client.post(
            "/api/auth/login", {"email": "reset@test.dev", "password": "brand-new-pw"}, format="json"
        )
        self.assertEqual(login_new.status_code, 200)

    def test_reset_request_for_unknown_email_is_silent(self):
        resp = self.client.post(
            "/api/auth/reset-password-request", {"email": "ghost@test.dev"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn("dev_reset_link", resp.json())

    # --- legacy hashers (db.json import path) ----------------------------------------

    def test_legacy_scrypt_login_and_upgrade(self):
        from core.hashers import MomentiLegacyScryptPasswordHasher
        from core.models import User

        salt = uuid.uuid4().hex  # Node: randomBytes(16).toString("hex")
        digest = hashlib.scrypt(
            "legacy-secret".encode("utf-8"),
            salt=salt.encode("ascii"),
            n=16384,
            r=8,
            p=1,
            dklen=64,
        ).hex()
        hasher = MomentiLegacyScryptPasswordHasher()
        user = User(email="legacy@test.dev", email_verified=True, role="member")
        user.password = hasher.encode(digest, salt)
        user.save()
        self.assertTrue(user.check_password("legacy-secret"))
        # Auto-upgraded to the preferred hasher after the successful check.
        self.assertTrue(user.password.startswith("pbkdf2_"))

        login = self.client.post(
            "/api/auth/login",
            {"email": "legacy@test.dev", "password": "legacy-secret"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)

    # --- RSVPs ---------------------------------------------------------------------

    def _create_invitation(self, token, slug="rsvp-party"):
        created = self.client.post(
            "/api/entities/invitations",
            {"slug": slug, "couple": "Host & Guest", "rsvpMaxGuests": "5"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        self.assertEqual(created.status_code, 201)
        return created.json()

    def test_rsvp_submit_list_and_upsert(self):
        token = self._register_and_verify()["access_token"]
        invitation = self._create_invitation(token)

        # Guests reply publicly — no account, no token.
        first = self.client.post(
            "/api/rsvps",
            {
                "slug": "rsvp-party",
                "name": "Ada Guest",
                "email": "ada@guest.dev",
                "attending": True,
                "guest_count": 3,
                "message": "Wouldn't miss it!",
            },
            format="json",
        )
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(first.json()["invitation_id"], invitation["id"])
        self.assertEqual(first.json()["slug"], "rsvp-party")
        self.assertTrue(first.json()["attending"])
        self.assertNotIn("updated", first.json())

        second = self.client.post(
            "/api/rsvps",
            {
                "slug": "rsvp-party",
                "name": "Bo Guest",
                "email": "bo@guest.dev",
                "attending": False,
                "guest_count": 1,
            },
            format="json",
        )
        self.assertEqual(second.status_code, 201)

        # Anonymous list is 401 (host data).
        anon = self.client.get(f"/api/rsvps?invitation={invitation['id']}")
        self.assertEqual(anon.status_code, 401)

        listed = self.client.get(
            f"/api/rsvps?invitation={invitation['id']}",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 2)

        # Same email re-submits: upsert, not duplicate.
        resubmit = self.client.post(
            "/api/rsvps",
            {
                "slug": "rsvp-party",
                "name": "Ada Guest",
                "email": "ADA@guest.dev",
                "attending": False,
                "guest_count": 1,
            },
            format="json",
        )
        self.assertEqual(resubmit.status_code, 200)
        self.assertTrue(resubmit.json()["updated"])
        self.assertEqual(resubmit.json()["id"], first.json()["id"])
        self.assertFalse(resubmit.json()["attending"])

        still_two = self.client.get(
            "/api/rsvps?slug=rsvp-party", HTTP_AUTHORIZATION=f"Bearer {token}"
        )
        self.assertEqual(still_two.status_code, 200)
        self.assertEqual(len(still_two.json()), 2)

        # Slug-based listing matches id-based listing.
        self.assertEqual(
            [r["id"] for r in still_two.json()],
            [r["id"] for r in listed.json()],
        )

    def test_rsvp_validation_errors(self):
        token = self._register_and_verify()["access_token"]
        self._create_invitation(token, slug="rsvp-validation")

        missing_slug = self.client.post(
            "/api/rsvps", {"name": "X", "email": "x@guest.dev", "attending": True}, format="json"
        )
        self.assertEqual(missing_slug.status_code, 400)

        unknown_slug = self.client.post(
            "/api/rsvps",
            {"slug": "nope", "name": "X", "email": "x@guest.dev", "attending": True},
            format="json",
        )
        self.assertEqual(unknown_slug.status_code, 404)

        missing_name = self.client.post(
            "/api/rsvps",
            {"slug": "rsvp-validation", "email": "x@guest.dev", "attending": True},
            format="json",
        )
        self.assertEqual(missing_name.status_code, 400)

        bad_email = self.client.post(
            "/api/rsvps",
            {"slug": "rsvp-validation", "name": "X", "email": "not-an-email", "attending": True},
            format="json",
        )
        self.assertEqual(bad_email.status_code, 400)

        bad_attending = self.client.post(
            "/api/rsvps",
            {"slug": "rsvp-validation", "name": "X", "email": "x@guest.dev", "attending": "maybe"},
            format="json",
        )
        self.assertEqual(bad_attending.status_code, 400)

        # Friendly strings are accepted (the form sends booleans; aliases are
        # for API tinkerers).
        accepts = self.client.post(
            "/api/rsvps",
            {"slug": "rsvp-validation", "name": "X", "email": "x@guest.dev", "attending": "accepts"},
            format="json",
        )
        self.assertEqual(accepts.status_code, 201)
        self.assertTrue(accepts.json()["attending"])

        bad_guests = self.client.post(
            "/api/rsvps",
            {
                "slug": "rsvp-validation",
                "name": "Y",
                "email": "y@guest.dev",
                "attending": True,
                "guest_count": 11,
            },
            format="json",
        )
        self.assertEqual(bad_guests.status_code, 400)


    

    # --- email delivery (SMTP) -----------------------------------------------------------------

    @override_settings(**EMAIL_TEST_SETTINGS)
    def test_register_emails_otp_no_dev_helper(self):
        from django.core import mail as mail_outbox
        from core.views import deliver_otp

        payload = deliver_otp("user@test.dev", "123456")
        self.assertEqual(payload, {"otp_sent": True})  # no dev_otp when emailing
        self.assertEqual(len(mail_outbox.outbox), 1)
        self.assertEqual(mail_outbox.outbox[0].to, ["user@test.dev"])
        self.assertIn("123456", mail_outbox.outbox[0].body)

    @override_settings(**EMAIL_TEST_SETTINGS)
    def test_register_response_omits_dev_helper_with_email(self):
        from django.core import mail as outbox

        reg = self.client.post(
            "/api/auth/register", {"email": "mail@test.dev", "password": "secret123"}, format="json"
        )
        self.assertEqual(reg.status_code, 201)
        body = reg.json()
        self.assertNotIn("dev_otp", body)  # code is emailed, not echoed
        self.assertEqual(len(outbox.outbox), 1)
        self.assertEqual(outbox.outbox[0].to, ["mail@test.dev"])
    def test_large_image_upload_succeeds(self):
        """Regression: Django's DATA_UPLOAD_MAX_MEMORY_SIZE default (2.5 MB)
        rejected larger base64 image uploads with a bare 400. The setting is
        raised to the 30 MB API body cap, so a >2.5 MB payload must succeed."""
        import base64

        token = self._register_and_verify()["access_token"]
        big = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"x" * (3 * 1024 * 1024)).decode()
        resp = self.client.post(
            "/api/uploads",
            {"filename": "large.png", "data": "data:image/png;base64," + big},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertIn(".png", resp.json()["file_url"])

    def test_uploads_library_list(self):
        token = self._register_and_verify()["access_token"]
        auth = {"HTTP_AUTHORIZATION": f"Bearer {token}"}
        up = self.client.post(
            "/api/uploads", {"filename": "dot.png", "data": PNG_DATA_URL}, format="json", **auth
        )
        self.assertEqual(up.status_code, 201)

        listing = self.client.get("/api/uploads?kind=image", **auth)
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.json()), 1)
        item = listing.json()[0]
        self.assertEqual(item["kind"], "image")
        self.assertEqual(item["name"], up.json()["file_url"].split("/")[-1])
        self.assertTrue(item["url"].startswith("/uploads/"))

        # anonymous denied
        self.assertEqual(self.client.get("/api/uploads").status_code, 401)

class ThrottlingConfigTests(TestCase):
    """Verify the throttle wiring on public endpoints (our code, not DRF's).

    DRF owns the actual rate-limiting math; our job is to confirm the views
    declare the right scopes and the settings expose the right rates.
    """

    def test_public_views_have_throttle_scopes(self):
        from core.views import (
            LoginView,
            RegisterView,
            ResendOtpView,
            ResetPasswordRequestView,
            RsvpListCreate,
            VerifyOtpView,
        )

        self.assertEqual(getattr(RegisterView, "throttle_scope", None), "otp")
        self.assertEqual(getattr(VerifyOtpView, "throttle_scope", None), "otp")
        self.assertEqual(getattr(ResendOtpView, "throttle_scope", None), "otp")
        self.assertEqual(getattr(ResetPasswordRequestView, "throttle_scope", None), "otp")
        self.assertEqual(getattr(LoginView, "throttle_scope", None), "login")
        self.assertEqual(getattr(RsvpListCreate, "throttle_scope", None), "rsvp")

    def test_throttle_rates_configured(self):
        from django.conf import settings

        rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        self.assertIn("otp", rates)
        self.assertIn("login", rates)
        self.assertIn("rsvp", rates)
        self.assertIn("anon", rates)

    def test_legal_urls_exposed_in_settings(self):
        from django.conf import settings

        # Defaults are empty (optional); the SPA hides the links when blank.
        self.assertEqual(settings.MOMENTI_TERMS_URL, "")
        self.assertEqual(settings.MOMENTI_PRIVACY_URL, "")

    def test_app_settings_endpoint_exposes_legal_urls(self):
        resp = self.client.get("/api/app/settings")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("terms_url", data)
        self.assertIn("privacy_url", data)

    def test_app_settings_endpoint_exposes_business_info(self):
        from django.test import override_settings

        with override_settings(
            MOMENTI_BUSINESS_NAME="Moments Studio",
            MOMENTI_BUSINESS_CONTACT_EMAIL="djahasiel@gmail.com",
            MOMENTI_BUSINESS_LOCATIONS=["Santa Ana, Tubay, Agusan del Norte"],
            MOMENTI_BUSINESS_SOCIALS=[
                {"name": "Instagram", "url": "https://www.instagram.com/momentsstudio"}
            ],
            MOMENTI_HERO_SAMPLE_LINK="/studio",
        ):
            resp = self.client.get("/api/app/settings")
            self.assertEqual(resp.status_code, 200)
            biz = resp.json()["public_settings"]["business"]
            self.assertEqual(biz["name"], "Moments Studio")
            self.assertEqual(biz["contactEmail"], "djahasiel@gmail.com")
            self.assertEqual(biz["locations"], ["Santa Ana, Tubay, Agusan del Norte"])
            self.assertEqual(biz["socials"][0]["name"], "Instagram")
            self.assertEqual(biz["socials"][0]["url"], "https://www.instagram.com/momentsstudio")
            self.assertEqual(biz["sampleLink"], "/studio")


@override_settings(MEDIA_ROOT=Path(tempfile.mkdtemp(prefix="momenti-test-media-analytics-")))
class AnalyticsTests(TestCase):
    """Phase 5: view tracking + daily dashboard series."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        # Reset DRF's cached throttle classes per-view.
        from rest_framework.views import APIView
        APIView.throttle_classes = []
        self.client = APIClient()
        self.owner = User.objects.create(email="host@test.dev", email_verified=True, role="member")
        self.owner.set_password("secret123")
        self.owner.save()
        self.token = issue_token(self.owner)
        self.invitation = Invitation.objects.create(
            slug="analytics-test",
            status="published",
            data={"couple": "A & B"},
            owner=self.owner,
            owner_email=self.owner.email,
        )

    def _auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.token}"}

    def test_track_requires_published_invitation(self):
        draft = Invitation.objects.create(
            slug="draft-test",
            status="draft",
            data={"couple": "X & Y"},
            owner=self.owner,
            owner_email=self.owner.email,
        )
        resp = self.client.post("/api/analytics/track", {"slug": draft.slug}, format="json")
        self.assertEqual(resp.status_code, 404)

    def test_track_records_view(self):
        resp = self.client.post("/api/analytics/track", {"slug": "analytics-test"}, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertTrue(resp.json().get("created"))

    def test_track_idempotent_per_day(self):
        self.client.post("/api/analytics/track", {"slug": "analytics-test"}, format="json")
        resp = self.client.post("/api/analytics/track", {"slug": "analytics-test"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json().get("created"))

    def test_analytics_dashboard_requires_auth(self):
        resp = self.client.get(f"/api/analytics/views?invitation={self.invitation.pk}")
        self.assertEqual(resp.status_code, 401)

    def test_analytics_dashboard_returns_series(self):
        # Seed a view first.
        self.client.post("/api/analytics/track", {"slug": "analytics-test"}, format="json")
        resp = self.client.get(
            f"/api/analytics/views?invitation={self.invitation.pk}&days=7",
            **self._auth(),
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertEqual(data["slug"], "analytics-test")
        self.assertEqual(data["days"], 7)
        self.assertGreaterEqual(data["total_views"], 1)
        self.assertEqual(len(data["series"]), 7)

    def test_analytics_dashboard_forbidden_for_other_user(self):
        other = User.objects.create(email="intruder@test.dev", email_verified=True, role="member")
        other.set_password("secret123")
        other.save()
        other_token = issue_token(other)
        resp = self.client.get(
            f"/api/analytics/views?invitation={self.invitation.pk}",
            HTTP_AUTHORIZATION=f"Bearer {other_token}",
        )
        self.assertEqual(resp.status_code, 404)



@override_settings(
    MEDIA_ROOT=Path(tempfile.mkdtemp(prefix="momenti-test-media-templates-")),
    **_TEST_THROTTLES,
)
class TemplateGalleryTests(TestCase):
    """Template gallery: public browsing, auth'd publishing, unique slugs."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        # Reset DRF's cached throttle classes per-view.
        from rest_framework.views import APIView
        APIView.throttle_classes = []
        self.client = APIClient()
        self.host = User.objects.create(email="designer@test.dev", email_verified=True, role="member")
        self.host.set_password("secret123")
        self.host.save()
        self.token = issue_token(self.host)

    def _auth(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.token}"}

    def test_list_is_public_and_seeded(self):
        resp = self.client.get("/api/templates")
        self.assertEqual(resp.status_code, 200)
        slugs = [t["slug"] for t in resp.json()["templates"]]
        self.assertIn("wedding", slugs)
        self.assertIn("birthday", slugs)
        self.assertIn("gala", slugs)
        self.assertIn("garden", slugs)
        self.assertIn("christening", slugs)

    def test_list_filter_by_source(self):
        resp = self.client.get("/api/templates?source=built-in")
        self.assertEqual(resp.status_code, 200)
        sources = {t["source"] for t in resp.json()["templates"]}
        self.assertEqual(sources, {"built-in"})

    def test_detail_returns_payload(self):
        resp = self.client.get("/api/templates/wedding")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["slug"], "wedding")
        self.assertIn("couple", body["payload"])

    def test_detail_404_for_unknown_slug(self):
        resp = self.client.get("/api/templates/nope")
        self.assertEqual(resp.status_code, 404)

    def test_publish_requires_auth(self):
        resp = self.client.post(
            "/api/templates/publish",
            {"name": "Debut", "payload": {"couple": "Ana"}},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)

    def test_publish_creates_community_template(self):
        resp = self.client.post(
            "/api/templates/publish",
            {
                "name": "Debut Glow",
                "tagline": "Eighteen roses",
                "payload": {"couple": "Ana", "accentColor": "#C58A58", "sections": []},
            },
            format="json",
            **self._auth(),
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(resp.json()["source"], "community")
        slug = resp.json()["slug"]
        # Identity fields must be stripped from the stored payload.
        tpl = Template.objects.get(slug=slug)
        self.assertNotIn("slug", tpl.payload)
        self.assertNotIn("title", tpl.payload)
        self.assertEqual(tpl.payload["couple"], "Ana")

    def test_publish_slug_collision_gets_suffix(self):
        body = {"name": "Debut Glow", "payload": {"couple": "Ana"}}
        first = self.client.post("/api/templates/publish", body, format="json", **self._auth())
        second = self.client.post("/api/templates/publish", body, format="json", **self._auth())
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertNotEqual(first.json()["slug"], second.json()["slug"])

    def test_publish_rejects_bad_payload(self):
        resp = self.client.post(
            "/api/templates/publish",
            {"name": "Broken", "payload": {"foo": "bar"}},
            format="json",
            **self._auth(),
        )
        self.assertEqual(resp.status_code, 400)

    def test_publish_requires_name(self):
        resp = self.client.post(
            "/api/templates/publish",
            {"payload": {"couple": "Ana"}},
            format="json",
            **self._auth(),
        )
        self.assertEqual(resp.status_code, 400)


@override_settings(
    MEDIA_ROOT=Path(tempfile.mkdtemp(prefix="momenti-test-media-billing-")),
    MOMENTI_QUOTA_ENFORCEMENT=True,
    MOMENTI_BILLING_MANUAL_ACTIVATION=True,
    **_TEST_THROTTLES,
)
class BillingQuotaTests(TestCase):
    """SaaS Phase 2: plan caps, manual admin activation, usage meters, cancel."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        from rest_framework.views import APIView
        APIView.throttle_classes = []
        self.client = APIClient()

    def _register(self, email="quota@test.dev"):
        reg = self.client.post(
            "/api/auth/register", {"email": email, "password": "secret123"}, format="json"
        )
        otp = reg.json()["dev_otp"]
        ver = self.client.post(
            "/api/auth/verify-otp", {"email": email, "otpCode": otp}, format="json"
        )
        return ver.json()["access_token"]

    def _auth(self, token):
        return {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    def _admin_token(self, email="billing-admin@test.dev"):
        user = User.objects.create_superuser(email=email, password="secret123")
        return issue_token(user)

    def test_free_plan_caps_invitations(self):
        token = self._register()
        h = self._auth(token)
        first = self.client.post(
            "/api/entities/invitations", {"slug": "only-one"}, format="json", **h
        )
        self.assertEqual(first.status_code, 201)
        second = self.client.post(
            "/api/entities/invitations", {"slug": "second"}, format="json", **h
        )
        self.assertEqual(second.status_code, 402)
        self.assertIn("limit", second.json()["error"])

    def test_usage_payload_default_free(self):
        token = self._register()
        resp = self.client.get("/api/billing/usage", **self._auth(token))
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["plan"]["code"], "free")
        self.assertEqual(body["usage"]["invitations_max"], 1)
        self.assertEqual(body["subscription"], None)

    def test_manual_activation_requires_admin_and_grants_pro(self):
        token = self._register()
        denied = self.client.post(
            "/api/billing/subscription/activate",
            {"email": "quota@test.dev", "plan": "pro"},
            format="json",
            **self._auth(token),
        )
        self.assertEqual(denied.status_code, 403)

        ok = self.client.post(
            "/api/billing/subscription/activate",
            {"email": "quota@test.dev", "plan": "pro"},
            format="json",
            **self._auth(self._admin_token("billing-admin-grant@test.dev")),
        )
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.json()["plan"]["code"], "pro")
        self.assertEqual(ok.json()["subscription"]["status"], "active")

        h = self._auth(token)
        self.assertEqual(
            self.client.post("/api/entities/invitations", {"slug": "a"}, format="json", **h).status_code,
            201,
        )
        self.assertEqual(
            self.client.post("/api/entities/invitations", {"slug": "b"}, format="json", **h).status_code,
            201,
        )
    def test_storage_quota_enforced_on_uploads(self):
        token = self._register()
        h = self._auth(token)
        # A 1 MB plan makes the storage cap trivial to hit.
        Plan.objects.create(
            code="micro", name="Micro", price_cents=0, max_invitations=100, max_storage_mb=1
        )
        self.client.post(
            "/api/billing/subscription/activate",
            {"email": "quota@test.dev", "plan": "micro"},
            format="json",
            **self._auth(self._admin_token("billing-admin-micro@test.dev")),
        )
        small = self.client.put(
            "/api/uploads/stream?filename=s.mp3",
            data=MP3_BYTES,
            content_type="audio/mpeg",
            **h,
        )
        self.assertEqual(small.status_code, 201)
        over = self.client.put(
            "/api/uploads/stream?filename=big.mp3",
            data=b"x" * (2 * 1024 * 1024),
            content_type="audio/mpeg",
            **h,
        )
        self.assertEqual(over.status_code, 402)
        self.assertIn("quota", over.json()["error"].lower())

    def test_cancel_marks_period_end(self):
        token = self._register()
        self.client.post(
            "/api/billing/subscription/activate",
            {"email": "quota@test.dev", "plan": "pro"},
            format="json",
            **self._auth(self._admin_token("billing-admin-cancel@test.dev")),
        )
        cancel = self.client.post(
            "/api/billing/subscription/cancel", {}, format="json", **self._auth(token)
        )
        self.assertEqual(cancel.status_code, 200)
        self.assertTrue(cancel.json()["subscription"]["cancel_at_period_end"])

    def test_manual_activation_disabled_flag(self):
        with override_settings(MOMENTI_BILLING_MANUAL_ACTIVATION=False):
            resp = self.client.post(
                "/api/billing/subscription/activate",
                {"email": "quota@test.dev", "plan": "pro"},
                format="json",
                **self._auth(self._admin_token("billing-admin-off@test.dev")),
            )
            self.assertEqual(resp.status_code, 403)

def _paymongo_sign(body_bytes, secret):
    """Sign a webhook payload exactly as PayMongo does (test helper)."""
    ts = str(int(time.time()))
    sig = hmac.new(
        secret.encode("utf-8"), (ts + ".").encode("ascii") + bytes(body_bytes), hashlib.sha256
    ).hexdigest()
    return f"{ts}.{sig}"


def _paid_event(reference):
    return {
        "data": {
            "id": "evt_test",
            "type": "event",
            "attributes": {
                "type": "checkout_session.payment.paid",
                "livemode": False,
                "data": {
                    "id": "cs_test_123",
                    "type": "checkout_session",
                    "attributes": {"reference_number": reference, "status": "paid"},
                },
            },
        }
    }


@override_settings(
    MEDIA_ROOT=Path(tempfile.mkdtemp(prefix="momenti-test-media-pm-")),
    MOMENTI_PAYMONGO_SECRET_KEY="sk_test_dummy",
    MOMENTI_PAYMONGO_WEBHOOK_SECRET="whsec_test",
    **_TEST_THROTTLES,
)
class PayMongoApiTests(TestCase):
    """SaaS Phase 3: checkout session creation + signed webhook handling."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        from rest_framework.views import APIView
        APIView.throttle_classes = []
        self.client = APIClient()

    def _register(self, email="pm@test.dev"):
        reg = self.client.post(
            "/api/auth/register", {"email": email, "password": "secret123"}, format="json"
        )
        otp = reg.json()["dev_otp"]
        ver = self.client.post(
            "/api/auth/verify-otp", {"email": email, "otpCode": otp}, format="json"
        )
        return ver.json()["access_token"]

    def _auth(self, token):
        return {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    def test_checkout_creates_session_and_pending(self):
        token = self._register()
        h = self._auth(token)

        def _fake_session(method, path, payload=None, timeout=10):
            ref = payload["data"]["attributes"]["reference_number"]
            return {
                "data": {
                    "id": "cs_test_abc",
                    "type": "checkout_session",
                    "attributes": {
                        "checkout_url": "https://checkout.paymongo.com/cs_test_abc",
                        "status": "active",
                        "reference_number": ref,
                    },
                }
            }

        with mock.patch.object(paymongo_mod, "paymongo_request", side_effect=_fake_session):
            resp = self.client.post("/api/billing/checkout", {"plan": "pro"}, format="json", **h)
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["checkout_url"], "https://checkout.paymongo.com/cs_test_abc")
        self.assertTrue(body["reference"].startswith("momenti-"))
        from core.models import User

        pending = PendingCheckout.objects.filter(user=User.objects.get(email="pm@test.dev")).first()
        self.assertIsNotNone(pending)
        self.assertEqual(pending.plan.code, "pro")
        self.assertEqual(pending.status, "pending")

    def test_checkout_unconfigured_is_503(self):
        token = self._register()
        with override_settings(MOMENTI_PAYMONGO_SECRET_KEY=""):
            resp = self.client.post(
                "/api/billing/checkout", {"plan": "pro"}, format="json", **self._auth(token)
            )
        self.assertEqual(resp.status_code, 503)

    def test_checkout_already_on_plan(self):
        token = self._register()
        from core.auth import issue_token

        admin = User.objects.create_superuser(email="pm-admin@test.dev", password="x")
        self.client.post(
            "/api/billing/subscription/activate",
            {"email": "pm@test.dev", "plan": "pro"},
            format="json",
            **self._auth(issue_token(admin)),
        )
        resp = self.client.post(
            "/api/billing/checkout", {"plan": "pro"}, format="json", **self._auth(token)
        )
        self.assertEqual(resp.status_code, 400)

    def test_webhook_rejects_bad_signature(self):
        resp = self.client.post(
            "/api/billing/webhook",
            data=_paid_event("momenti-none"),
            content_type="application/json",
            HTTP_PAYMONGO_SIGNATURE="1.deadbeef",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Signature", resp.json()["error"])

    def test_webhook_paid_grants_subscription_and_is_idempotent(self):
        from core.models import User

        token = self._register()
        user = User.objects.get(email="pm@test.dev")
        pending = PendingCheckout.objects.create(
            reference="momenti-test-1",
            user=user,
            plan=Plan.objects.get(code="pro"),
            period_days=30,
        )
        body = json.dumps(_paid_event(pending.reference)).encode("utf-8")
        sig = _paymongo_sign(body, "whsec_test")

        resp = self.client.post(
            "/api/billing/webhook",
            data=body,
            content_type="application/json",
            HTTP_PAYMONGO_SIGNATURE=sig,
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        pending.refresh_from_db()
        self.assertEqual(pending.status, "paid")

        usage = self.client.get("/api/billing/usage", **self._auth(token))
        self.assertEqual(usage.json()["plan"]["code"], "pro")
        sub = usage.json()["subscription"]
        self.assertEqual(sub["provider"], "paymongo")
        self.assertEqual(sub["provider_ref"], "cs_test_123")

        # Retry: idempotent, still 200, no change.
        retry = self.client.post(
            "/api/billing/webhook",
            data=body,
            content_type="application/json",
            HTTP_PAYMONGO_SIGNATURE=sig,
        )
        self.assertEqual(retry.status_code, 200)
        again = self.client.get("/api/billing/usage", **self._auth(token))
        self.assertEqual(again.json()["subscription"]["provider_ref"], "cs_test_123")

    def test_webhook_paid_accepts_current_payload_shape(self):
        """Current Hosted Checkout payloads put the event type at data.type
        and the resource at data.data (per docs.paymongo.com Hosted Checkout
        guide). That shape must grant the subscription too."""
        from core.models import User

        token = self._register(email="pm2@test.dev")
        user = User.objects.get(email="pm2@test.dev")
        pending = PendingCheckout.objects.create(
            reference="momenti-test-2",
            user=user,
            plan=Plan.objects.get(code="pro"),
            period_days=30,
        )
        event = {
            "event_type": "send.webhook",
            "data": {
                "type": "checkout_session.payment.paid",
                "resource": "checkout_session",
                "livemode": False,
                "created_at": "2026-09-04T00:00:00Z",
                "updated_at": "2026-09-04T00:00:00Z",
                "data": {
                    "id": "cs_test_456",
                    "type": "checkout_session",
                    "attributes": {
                        "reference_number": pending.reference,
                        "payments": [],
                    },
                },
            },
        }
        body = json.dumps(event).encode("utf-8")
        sig = _paymongo_sign(body, "whsec_test")
        resp = self.client.post(
            "/api/billing/webhook",
            data=body,
            content_type="application/json",
            HTTP_PAYMONGO_SIGNATURE=sig,
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        pending.refresh_from_db()
        self.assertEqual(pending.status, "paid")
        usage = self.client.get("/api/billing/usage", **self._auth(token))
        self.assertEqual(usage.json()["plan"]["code"], "pro")
        self.assertEqual(usage.json()["subscription"]["provider_ref"], "cs_test_456")

    def test_webhook_unknown_reference_acknowledges(self):
        body = json.dumps(_paid_event("momenti-does-not-exist")).encode("utf-8")
        sig = _paymongo_sign(body, "whsec_test")
        resp = self.client.post(
            "/api/billing/webhook",
            data=body,
            content_type="application/json",
            HTTP_PAYMONGO_SIGNATURE=sig,
        )
        # PayMongo retries on non-2xx — an unknown reference must still ack.
        self.assertEqual(resp.status_code, 200)

    def test_webhook_payment_failed_marks_pending(self):
        self._register()
        from core.models import User

        user = User.objects.get(email="pm@test.dev")
        PendingCheckout.objects.create(
            reference="momenti-fail-1", user=user, plan=Plan.objects.get(code="pro")
        )
        event = {
            "data": {
                "id": "evt_fail",
                "type": "event",
                "attributes": {
                    "type": "payment.failed",
                    "data": {
                        "id": "pay_1",
                        "type": "payment",
                        "attributes": {"reference_number": "momenti-fail-1"},
                    },
                },
            }
        }
        body = json.dumps(event).encode("utf-8")
        sig = _paymongo_sign(body, "whsec_test")
        resp = self.client.post(
            "/api/billing/webhook",
            data=body,
            content_type="application/json",
            HTTP_PAYMONGO_SIGNATURE=sig,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            PendingCheckout.objects.get(reference="momenti-fail-1").status, "failed"
        )


@override_settings(
    MOMENTI_PAYMONGO_SECRET_KEY="sk_test_dummy",
    MOMENTI_PAYMONGO_WEBHOOK_SECRET="whsec_test",
    **_TEST_THROTTLES,
)
class BillingPlanSyncTests(TestCase):
    """MOMENTI_PRO_PRICE_CENTS boot sync: env-driven Pro plan pricing.

    `billing_sync_plans` runs at container boot (entrypoint, right after
    migrate) so the seeded Pro plan's price matches what /studio/billing
    shows and what the PayMongo checkout charges."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        from rest_framework.views import APIView
        APIView.throttle_classes = []
        self.client = APIClient()

    def _register(self, email="sync@test.dev"):
        reg = self.client.post(
            "/api/auth/register", {"email": email, "password": "secret123"}, format="json"
        )
        otp = reg.json()["dev_otp"]
        ver = self.client.post(
            "/api/auth/verify-otp", {"email": email, "otpCode": otp}, format="json"
        )
        return ver.json()["access_token"]

    def test_env_price_applied_to_pro_plan(self):
        from django.core.management import call_command

        with override_settings(MOMENTI_PRO_PRICE_CENTS="29900"):
            call_command("billing_sync_plans")
        self.assertEqual(Plan.objects.get(code="pro").price_cents, 29900)
        # Free stays untouched.
        self.assertEqual(Plan.objects.get(code="free").price_cents, 0)

    def test_invalid_value_fails_loudly_and_changes_nothing(self):
        from django.core.management import call_command
        from django.core.management.base import CommandError

        with override_settings(MOMENTI_PRO_PRICE_CENTS="four-ninety-nine"):
            with self.assertRaises(CommandError):
                call_command("billing_sync_plans")
        self.assertEqual(Plan.objects.get(code="pro").price_cents, 49900)

    def test_unset_value_is_a_noop(self):
        from django.core.management import call_command

        with override_settings(MOMENTI_PRO_PRICE_CENTS=""):
            call_command("billing_sync_plans")
        self.assertEqual(Plan.objects.get(code="pro").price_cents, 49900)

    def test_checkout_charges_the_synced_price(self):
        from django.core.management import call_command

        token = self._register()
        h = {"HTTP_AUTHORIZATION": f"Bearer {token}"}
        with override_settings(MOMENTI_PRO_PRICE_CENTS="29900"):
            call_command("billing_sync_plans")
        captured = {}

        def _fake_session(method, path, payload=None, timeout=10):
            captured["amount"] = payload["data"]["attributes"]["line_items"][0]["amount"]
            return {
                "data": {
                    "id": "cs_test_priced",
                    "type": "checkout_session",
                    "attributes": {
                        "checkout_url": "https://checkout.paymongo.com/cs_test_priced",
                        "status": "active",
                    },
                }
            }

        with mock.patch.object(paymongo_mod, "paymongo_request", side_effect=_fake_session):
            resp = self.client.post("/api/billing/checkout", {"plan": "pro"}, format="json", **h)
        self.assertEqual(resp.status_code, 200, resp.content)
        # The checkout session must charge exactly the env-driven price.
        self.assertEqual(captured["amount"], 29900)


@override_settings(
    MOMENTI_PAYMONGO_SECRET_KEY="sk_test_dummy",
    MOMENTI_PAYMONGO_WEBHOOK_SECRET="whsec_test",
    MOMENTI_PAYMONGO_FLOW="qrph",
    **_TEST_THROTTLES,
)
class BillingQrPhTests(TestCase):
    """MOMENTI_PAYMONGO_FLOW=qrph: native QR Ph checkout (Payment Intents API).

    The buyer gets a scannable QR code rendered on the Billing page itself —
    no redirect to PayMongo's hosted checkout — and the plan is granted by the
    payment.paid webhook matching the stored PaymentIntent id."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        from rest_framework.views import APIView
        APIView.throttle_classes = []
        self.client = APIClient()

    def _register(self, email="qr@test.dev"):
        reg = self.client.post(
            "/api/auth/register", {"email": email, "password": "secret123"}, format="json"
        )
        otp = reg.json()["dev_otp"]
        ver = self.client.post(
            "/api/auth/verify-otp", {"email": email, "otpCode": otp}, format="json"
        )
        return ver.json()["access_token"]

    def _auth(self, token):
        return {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    def _fake_paymongo(self, calls):
        def _handler(method, path, payload=None, timeout=10):
            calls.append(path)
            if path == "payment_intents":
                return {
                    "data": {
                        "id": "pi_test_1",
                        "type": "payment_intent",
                        "attributes": {
                            "amount": 49900,
                            "status": "awaiting_payment_method",
                            "client_key": "ck_test_1",
                        },
                    }
                }
            if path == "payment_methods":
                return {
                    "data": {
                        "id": "pm_test_1",
                        "type": "payment_method",
                        "attributes": {"type": "qrph"},
                    }
                }
            if path.startswith("payment_intents/pi_test_1/attach"):
                return {
                    "data": {
                        "id": "pi_test_1",
                        "type": "payment_intent",
                        "attributes": {
                            "status": "awaiting_next_action",
                            "next_action": {
                                "code": {
                                    "image_url": "data:image/svg+xml;base64,UVJDT0RFR0VORVJBVEVE"
                                }
                            },
                        },
                    }
                }
            raise AssertionError(f"unexpected PayMongo path {path!r}")

        return _handler

    def test_checkout_returns_scannable_qr_and_pending(self):
        from core.models import User

        token = self._register()
        calls = []
        with mock.patch.object(
            paymongo_mod, "paymongo_request", side_effect=self._fake_paymongo(calls)
        ):
            resp = self.client.post(
                "/api/billing/checkout", {"plan": "pro"}, format="json",
                **{"HTTP_AUTHORIZATION": f"Bearer {token}"},
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertEqual(body["flow"], "qrph")
        self.assertEqual(body["qr_image"], "data:image/svg+xml;base64,UVJDT0RFR0VORVJBVEVE")
        self.assertTrue(body["reference"].startswith("momenti-"))
        # Intent -> method -> attach, in that order.
        self.assertEqual(calls, ["payment_intents", "payment_methods",
                                 "payment_intents/pi_test_1/attach"])
        pending = PendingCheckout.objects.get(user__email="qr@test.dev")
        self.assertEqual(pending.status, "pending")
        self.assertEqual(pending.provider_ref, "pi_test_1")

    def test_payment_paid_webhook_grants_plan(self):
        from core.models import User

        token = self._register()
        user = User.objects.get(email="qr@test.dev")
        pending = PendingCheckout.objects.create(
            reference="momenti-qr-1",
            user=user,
            plan=Plan.objects.get(code="pro"),
            provider_ref="pi_test_9",
            period_days=30,
        )
        event = {
            "data": {
                "id": "evt_qr",
                "type": "event",
                "attributes": {
                    "type": "payment.paid",
                    "data": {
                        "id": "pay_qr_9",
                        "type": "payment",
                        "attributes": {
                            "amount": 49900,
                            "currency": "PHP",
                            "status": "paid",
                            "payment_intent_id": "pi_test_9",
                        },
                    },
                },
            }
        }
        body = json.dumps(event).encode("utf-8")
        sig = _paymongo_sign(body, "whsec_test")
        resp = self.client.post(
            "/api/billing/webhook",
            data=body,
            content_type="application/json",
            HTTP_PAYMONGO_SIGNATURE=sig,
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        pending.refresh_from_db()
        self.assertEqual(pending.status, "paid")
        usage = self.client.get("/api/billing/usage", **self._auth(token))
        self.assertEqual(usage.json()["plan"]["code"], "pro")
        # Retry: idempotent ack, no double grant.
        retry = self.client.post(
            "/api/billing/webhook",
            data=body,
            content_type="application/json",
            HTTP_PAYMONGO_SIGNATURE=sig,
        )
        self.assertEqual(retry.status_code, 200)
        usage_again = self.client.get("/api/billing/usage", **self._auth(token))
        self.assertEqual(usage_again.json()["subscription"]["provider"], "paymongo")

    def test_payment_failed_webhook_marks_pending(self):
        from core.models import User

        self._register()
        user = User.objects.get(email="qr@test.dev")
        pending = PendingCheckout.objects.create(
            reference="momenti-qr-2",
            user=user,
            plan=Plan.objects.get(code="pro"),
            provider_ref="pi_test_8",
            period_days=30,
        )
        event = {
            "data": {
                "id": "evt_qr_fail",
                "type": "event",
                "attributes": {
                    "type": "payment.failed",
                    "data": {
                        "id": "pay_qr_8",
                        "type": "payment",
                        "attributes": {
                            "status": "failed",
                            "payment_intent_id": "pi_test_8",
                        },
                    },
                },
            }
        }
        body = json.dumps(event).encode("utf-8")
        sig = _paymongo_sign(body, "whsec_test")
        resp = self.client.post(
            "/api/billing/webhook",
            data=body,
            content_type="application/json",
            HTTP_PAYMONGO_SIGNATURE=sig,
        )
        self.assertEqual(resp.status_code, 200)
        pending.refresh_from_db()
        self.assertEqual(pending.status, "failed")

    def test_status_endpoint_polls_paymongo_and_grants(self):
        """The QR poll asks PayMongo directly; a succeeded intent grants the
        plan even when webhook delivery is missing."""
        from core.models import User

        token = self._register()
        user = User.objects.get(email="qr@test.dev")
        PendingCheckout.objects.create(
            reference="momenti-qr-3",
            user=user,
            plan=Plan.objects.get(code="pro"),
            provider_ref="pi_test_7",
            period_days=30,
        )

        def _fake(method, path, payload=None, timeout=10):
            self.assertEqual(method, "GET")
            self.assertEqual(path, "payment_intents/pi_test_7")
            return {
                "data": {
                    "id": "pi_test_7",
                    "type": "payment_intent",
                    "attributes": {"status": "succeeded", "amount": 49900},
                }
            }

        with mock.patch.object(paymongo_mod, "paymongo_request", side_effect=_fake):
            resp = self.client.get(
                "/api/billing/checkout/status?reference=momenti-qr-3",
                **self._auth(token),
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.json()["status"], "paid")
        self.assertEqual(
            PendingCheckout.objects.get(reference="momenti-qr-3").status, "paid"
        )
        usage = self.client.get("/api/billing/usage", **self._auth(token))
        self.assertEqual(usage.json()["plan"]["code"], "pro")

    def test_status_endpoint_pending_needs_no_paymongo_call(self):
        """An unpaid QR (no PayMongo ref yet) answers pending without any
        provider call."""
        from core.models import User

        token = self._register()
        user = User.objects.get(email="qr@test.dev")
        PendingCheckout.objects.create(
            reference="momenti-qr-4",
            user=user,
            plan=Plan.objects.get(code="pro"),
            provider_ref="",
            period_days=30,
        )
        # No mock: if the view hit PayMongo here it would raise (URLError).
        resp = self.client.get(
            "/api/billing/checkout/status?reference=momenti-qr-4",
            **self._auth(token),
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "pending")

    def test_status_endpoint_unknown_reference_is_404(self):
        token = self._register()
        resp = self.client.get(
            "/api/billing/checkout/status?reference=momenti-none",
            **self._auth(token),
        )
        self.assertEqual(resp.status_code, 404)

