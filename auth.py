"""Clerk authentication for FastAPI.

The frontend signs the user in with Clerk, gets a session token
(`await getToken()` in Clerk's JS/React SDK) and sends it as:
    Authorization: Bearer <token>
"""
import os
from typing import Annotated

from clerk_backend_api import AuthenticateRequestOptions, Clerk, authenticate_request
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from dotenv import load_dotenv

load_dotenv()

CLERK_SECRET_KEY = os.environ["CLERK_SECRET_KEY"]
# Optional PEM public key (Clerk Dashboard → API keys). With it, tokens are
# verified locally; without it the SDK fetches Clerk's keys over the network.
CLERK_JWT_KEY = os.getenv("CLERK_JWT_KEY") or None
# Comma-separated frontend origins allowed to call this API
AUTHORIZED_PARTIES = [
    o.strip()
    for o in os.getenv("CLERK_AUTHORIZED_PARTIES", "http://localhost:3000").split(",")
    if o.strip()
]

clerk = Clerk(bearer_auth=CLERK_SECRET_KEY)

# Adds the "Authorize" button to /docs; actual checking is done below.
_bearer = HTTPBearer(auto_error=False)


def require_clerk_user(
    request: Request,
    _creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> str:
    """Return the signed-in Clerk user id (user_xxx), or reject with 401."""
    state = authenticate_request(
        request,
        AuthenticateRequestOptions(
            secret_key=CLERK_SECRET_KEY,
            jwt_key=CLERK_JWT_KEY,
            authorized_parties=AUTHORIZED_PARTIES,
            accepts_token=["session_token"],
        ),
    )
    if not state.is_signed_in:
        raise HTTPException(
            status_code=401,
            detail=state.reason.name if state.reason else "unauthorized",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return state.payload["sub"]


ClerkUserId = Annotated[str, Depends(require_clerk_user)]


async def fetch_clerk_contact(clerk_id: str) -> tuple[str | None, str | None]:
    """Primary email and phone number stored on the Clerk user."""
    u = await clerk.users.get_async(user_id=clerk_id)
    email = next(
        (e.email_address for e in u.email_addresses or [] if e.id == u.primary_email_address_id),
        None,
    )
    phone = next(
        (p.phone_number for p in u.phone_numbers or [] if p.id == u.primary_phone_number_id),
        None,
    )
    return email, phone