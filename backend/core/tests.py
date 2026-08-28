"""End-to-end API tests — the Django twin of scripts/smoke-api.mjs.

Exercises the whole public surface: health/settings, register -> OTP ->
token -> me, login, invitation CRUD with the sort/filter semantics, slug
uniqueness and auth guards, both upload endpoints, the uploads traversal
guard, and the password-reset flow.
"""
import hashlib
import tempfile
import time
import uuid
from pathlib import Path

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

PNG_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
MP3_BYTES = b"ID3\x03\x00\x00\x00\x00\x00\x00"  # minimal "ID3" header


@override_settings(MEDIA_ROOT=Path(tempfile.mkdtemp(prefix="momenti-test-media-")))
class MomentiApiTests(TestCase):
    def setUp(self):
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

        listing = self.client.get("/api/entities/invitations?sort=-created_date&limit=10")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.json()[0]["slug"], "beta-gala")
        self.assertEqual(len(listing.json()), 2)

        filtered = self.client.get("/api/entities/invitations?slug=beta-gala")
        self.assertEqual(len(filtered.json()), 1)
        self.assertEqual(filtered.json()[0]["slug"], "beta-gala")

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
        remaining = self.client.get("/api/entities/invitations?sort=-created_date")
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
        garbage = self.client.get("/api/entities/invitations/not-a-uuid")
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
            "music": {"url": "/uploads/loop.mp3", "autoplay": False},
            "theme": {"textColor": "#F2F0ED", "paperColor": "#F2F0ED", "displayFont": "serif"},
        }
        created = self.client.post("/api/entities/invitations", payload, format="json", **headers)
        self.assertEqual(created.status_code, 201)
        record = created.json()
        self.assertEqual(record["owner_email"], "smoke@test.dev")
        self.assertEqual(record["heroImageMobile"], "/uploads/hero-mobile.jpg")
        self.assertIn("created_date", record)
        self.assertIn("updated_date", record)
        self.assertEqual(record["music"]["autoplay"], False)

        fetched = self.client.get("/api/entities/invitations?slug=media-invite")
        self.assertEqual(fetched.json()[0]["theme"]["displayFont"], "serif")

        # Primitive-array membership via the Node-parity fallback path: the
        # ORM exact-match finds nothing (tags is a list), so the verifier
        # replicates Node's String(element) === value scan.
        by_tag = self.client.get("/api/entities/invitations?tags=outdoor")
        self.assertEqual(len(by_tag.json()), 1)
        self.assertEqual(by_tag.json()[0]["slug"], "media-invite")

        # Arrays of objects never string-match in Node ("[object Object]").
        by_gallery = self.client.get("/api/entities/invitations?gallery=/uploads/clip.mp4")
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

        missing_params = self.client.get(
            "/api/rsvps", HTTP_AUTHORIZATION=f"Bearer {token}"
        )
        self.assertEqual(missing_params.status_code, 400)


