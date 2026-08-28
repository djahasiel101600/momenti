"""Password hasher for accounts imported from the legacy Node backend.

Node's api.mjs stored scrypt digests as "<hex salt>:<hex digest>" using
OpenSSL defaults (N=16384, r=8, p=1, dkLen=64) and passed the *hex string*
itself as the scrypt salt. This hasher verifies that legacy format; because
`must_update` is True, Django transparently re-hashes to the preferred
algorithm (PBKDF2) on the next successful login.
"""
import hashlib

from django.contrib.auth.hashers import BasePasswordHasher, mask_hash
from django.utils.crypto import constant_time_compare


class MomentiLegacyScryptPasswordHasher(BasePasswordHasher):
    algorithm = "momenti_scrypt"

    SCRYPT_N = 16384
    SCRYPT_R = 8
    SCRYPT_P = 1
    DKLEN = 64

    def encode(self, digest_hex, salt, iterations=None):
        # `digest_hex` is the legacy hex digest taken from "<salt>:<digest>".
        return f"{self.algorithm}${salt}${digest_hex}"

    def verify(self, password, encoded):
        try:
            _, salt, digest = encoded.split("$", 2)
            computed = hashlib.scrypt(
                str(password).encode("utf-8"),
                salt=str(salt).encode("ascii"),
                n=self.SCRYPT_N,
                r=self.SCRYPT_R,
                p=self.SCRYPT_P,
                dklen=self.DKLEN,
            ).hex()
        except (ValueError, TypeError):
            return False
        return constant_time_compare(computed, digest)

    def must_update(self, encoded):
        return True

    def decode(self, encoded):
        _, salt, digest = encoded.split("$", 2)
        return {"algorithm": self.algorithm, "salt": salt, "hash": digest, "iterations": None}

    def safe_summary(self, encoded):
        _, salt, digest = encoded.split("$", 2)
        return {
            "algorithm": self.algorithm,
            "salt": mask_hash(salt, show=2),
            "hash": mask_hash(digest, show=3),
        }

    def harden_runtime(self, password, encoded):
        # Legacy verification runs at fixed cost; nothing to harden.
        pass
