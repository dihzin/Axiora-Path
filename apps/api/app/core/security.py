from __future__ import annotations

from datetime import UTC, datetime, timedelta
import re
from typing import Any
from secrets import token_urlsafe

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import settings

JWT_ISSUER = "axiora-path"
ACCESS_TOKEN_MINUTES = 15
REFRESH_TOKEN_DAYS = 7
REFRESH_COOKIE_NAME = "axiora_refresh_token"
CSRF_COOKIE_NAME = "axiora_csrf_token"

_password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def _create_token(
    *,
    token_type: str,
    user_id: int,
    tenant_id: int,
    role: str,
    expires_delta: timedelta,
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "iss": JWT_ISSUER,
        "sub": str(user_id),
        "tenant_id": tenant_id,
        "role": role,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def create_access_token(*, user_id: int, tenant_id: int, role: str) -> str:
    return _create_token(
        token_type="access",
        user_id=user_id,
        tenant_id=tenant_id,
        role=role,
        expires_delta=timedelta(minutes=ACCESS_TOKEN_MINUTES),
    )


def create_refresh_token(*, user_id: int, tenant_id: int, role: str) -> str:
    return _create_token(
        token_type="refresh",
        user_id=user_id,
        tenant_id=tenant_id,
        role=role,
        expires_delta=timedelta(days=REFRESH_TOKEN_DAYS),
    )


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=["HS256"],
        issuer=JWT_ISSUER,
    )


def generate_csrf_token() -> str:
    return token_urlsafe(32)


def validate_password_strength(password: str) -> str | None:
    if len(password) < 10:
        return "Password must be at least 10 characters long"
    if not re.search(r"[A-Z]", password):
        return "Password must contain an uppercase letter"
    if not re.search(r"[a-z]", password):
        return "Password must contain a lowercase letter"
    if not re.search(r"\d", password):
        return "Password must contain a number"
    if not re.search(r"[^A-Za-z0-9]", password):
        return "Password must contain a special character"
    return None
