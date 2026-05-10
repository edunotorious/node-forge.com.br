import bcrypt

# Pre-computed dummy hash. `dummy_verify` runs bcrypt against this when the
# user lookup misses on login, so the response time matches the real-user
# branch and an attacker cannot enumerate registered emails by latency.
_DUMMY_HASH: bytes = bcrypt.hashpw(b"dummy-password-for-timing-defense", bcrypt.gensalt(rounds=12))


def hash_password(plain: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def dummy_verify(plain: str) -> None:
    bcrypt.checkpw(plain.encode("utf-8"), _DUMMY_HASH)
