"""JWT authentication utilities for Wayly."""
import os
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
TOKEN_TTL_HOURS = 24 * 30  # 30 days

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user_id(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(creds.credentials)


async def get_current_admin_id(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    """Resolve the JWT and verify the user has `is_admin=True` in the DB.
    Importing the Mongo client lazily here to avoid circular imports."""
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = decode_token(creds.credentials)
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "is_admin": 1})
    if not user or not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user_id
