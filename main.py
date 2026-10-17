import os
from contextlib import asynccontextmanager
from datetime import datetime
from enum import Enum
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel, EmailStr

from auth import AUTHORIZED_PARTIES, ClerkUserId, fetch_clerk_contact, require_clerk_user

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL") or (
    f"postgresql://{os.getenv('PGUSER')}:{os.getenv('PGPASSWORD')}"
    f"@{os.getenv('PGHOST')}:{os.getenv('PGPORT', '5432')}"
    f"/{os.getenv('PGDATABASE', 'tsdb')}?sslmode=require"
)

pool = AsyncConnectionPool(DATABASE_URL, open=False, kwargs={"row_factory": dict_row})
SCHEMA_SQL = (Path(__file__).parent / "schema.sql").read_text()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await pool.open()
    async with pool.connection() as conn:
        await conn.execute(SCHEMA_SQL)  # creates enum + tables if missing
    yield
    await pool.close()


# Every route requires a signed-in Clerk user
app = FastAPI(lifespan=lifespan, dependencies=[Depends(require_clerk_user)])

# Let your frontend (same origins Clerk allows) call this API from the browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=AUTHORIZED_PARTIES,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- models ----------

class Role(str, Enum):
    patient = "patient"
    caretaker = "caretaker"


class UserIn(BaseModel):
    email: EmailStr
    phone_number: str | None = None
    role: Role


class User(UserIn):
    id: int
    clerk_id: str | None = None
    created_at: datetime


class SignupIn(BaseModel):
    role: Role
    phone_number: str | None = None  # falls back to the phone saved in Clerk


class PartnerIn(BaseModel):
    partner_email: EmailStr


class LinkIn(BaseModel):
    patient_id: int
    caretaker_id: int


class Link(LinkIn):
    created_at: datetime


# ---------- the signed-in user ----------

async def _me(conn, clerk_id: str):
    cur = await conn.execute("SELECT * FROM users WHERE clerk_id = %s", (clerk_id,))
    return await cur.fetchone()


@app.get("/me", response_model=User)
async def get_me(clerk_id: ClerkUserId):
    async with pool.connection() as conn:
        row = await _me(conn, clerk_id)
    if row is None:
        raise HTTPException(404, "Not registered yet: POST /me with your role")
    return row


@app.post("/me", response_model=User, status_code=201)
async def register_me(body: SignupIn, clerk_id: ClerkUserId):
    """First call after signing up with Clerk: pick patient or caretaker."""
    email, clerk_phone = await fetch_clerk_contact(clerk_id)
    if not email:
        raise HTTPException(400, "Your Clerk account has no primary email")
    try:
        async with pool.connection() as conn:
            cur = await conn.execute(
                "INSERT INTO users (clerk_id, email, phone_number, role) "
                "VALUES (%s, %s, %s, %s) RETURNING *",
                (clerk_id, email, body.phone_number or clerk_phone, body.role.value),
            )
            return await cur.fetchone()
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, "Already registered (or email in use)")


@app.post("/me/link", response_model=Link, status_code=201)
async def link_me(body: PartnerIn, clerk_id: ClerkUserId):
    """Link yourself to your patient/caretaker by their email."""
    async with pool.connection() as conn:
        me = await _me(conn, clerk_id)
        if me is None:
            raise HTTPException(404, "Register first: POST /me")
        cur = await conn.execute("SELECT * FROM users WHERE email = %s", (body.partner_email,))
        partner = await cur.fetchone()
    if partner is None:
        raise HTTPException(404, "No user with that email")
    if partner["role"] == me["role"]:
        raise HTTPException(400, f"Both users are {me['role']}s")
    patient, caretaker = (me, partner) if me["role"] == "patient" else (partner, me)
    return await add_link(LinkIn(patient_id=patient["id"], caretaker_id=caretaker["id"]))


@app.get("/me/partner", response_model=User)
async def get_my_partner(clerk_id: ClerkUserId):
    async with pool.connection() as conn:
        me = await _me(conn, clerk_id)
    if me is None:
        raise HTTPException(404, "Register first: POST /me")
    return await get_partner(me["id"])


# ---------- users ----------

@app.get("/users", response_model=list[User])
async def list_users(role: Role | None = None):
    async with pool.connection() as conn:
        if role:
            cur = await conn.execute(
                "SELECT * FROM users WHERE role = %s ORDER BY id", (role.value,)
            )
        else:
            cur = await conn.execute("SELECT * FROM users ORDER BY id")
        return await cur.fetchall()


@app.get("/users/{user_id}", response_model=User)
async def get_user(user_id: int):
    async with pool.connection() as conn:
        cur = await conn.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        row = await cur.fetchone()
    if row is None:
        raise HTTPException(404, "User not found")
    return row


@app.post("/users", response_model=User, status_code=201)
async def add_user(user: UserIn):
    try:
        async with pool.connection() as conn:
            cur = await conn.execute(
                "INSERT INTO users (email, phone_number, role) "
                "VALUES (%s, %s, %s) RETURNING *",
                (user.email, user.phone_number, user.role.value),
            )
            return await cur.fetchone()
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, "Email already registered")


@app.delete("/users/{user_id}", status_code=204)
async def remove_user(user_id: int):
    # Any care link for this user is removed automatically (ON DELETE CASCADE)
    async with pool.connection() as conn:
        cur = await conn.execute("DELETE FROM users WHERE id = %s", (user_id,))
    if cur.rowcount == 0:
        raise HTTPException(404, "User not found")


# ---------- patient <-> caretaker links ----------

@app.get("/links", response_model=list[Link])
async def list_links():
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT patient_id, caretaker_id, created_at FROM care_links ORDER BY patient_id"
        )
        return await cur.fetchall()


@app.post("/links", response_model=Link, status_code=201)
async def add_link(link: LinkIn):
    try:
        async with pool.connection() as conn:
            cur = await conn.execute(
                "INSERT INTO care_links (patient_id, caretaker_id) VALUES (%s, %s) "
                "RETURNING patient_id, caretaker_id, created_at",
                (link.patient_id, link.caretaker_id),
            )
            return await cur.fetchone()
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, "That patient or caretaker is already linked")
    except psycopg.errors.ForeignKeyViolation:
        raise HTTPException(
            400, "patient_id must be an existing patient and caretaker_id an existing caretaker"
        )


@app.get("/users/{user_id}/partner", response_model=User)
async def get_partner(user_id: int):
    """A patient's caretaker, or a caretaker's patient."""
    async with pool.connection() as conn:
        cur = await conn.execute(
            """
            SELECT u.* FROM care_links l
            JOIN users u ON u.id = CASE WHEN l.patient_id = %(id)s
                                        THEN l.caretaker_id ELSE l.patient_id END
            WHERE l.patient_id = %(id)s OR l.caretaker_id = %(id)s
            """,
            {"id": user_id},
        )
        row = await cur.fetchone()
    if row is None:
        raise HTTPException(404, "No linked user")
    return row


@app.delete("/links/{user_id}", status_code=204)
async def remove_link(user_id: int):
    """Unlink a user (patient or caretaker id) from their partner."""
    async with pool.connection() as conn:
        cur = await conn.execute(
            "DELETE FROM care_links WHERE patient_id = %s OR caretaker_id = %s",
            (user_id, user_id),
        )
    if cur.rowcount == 0:
        raise HTTPException(404, "No link for that user")