import os
from contextlib import asynccontextmanager
from datetime import datetime

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel

load_dotenv()

# Tiger Data gives you a full connection string; put it in .env as DATABASE_URL.
# Falls back to the standard PG* variables if you have those instead.
DATABASE_URL = os.getenv("DATABASE_URL") or (
    f"postgresql://{os.getenv('PGUSER')}:{os.getenv('PGPASSWORD')}"
    f"@{os.getenv('PGHOST')}:{os.getenv('PGPORT', '5432')}"
    f"/{os.getenv('PGDATABASE', 'tsdb')}?sslmode=require"
)

pool = AsyncConnectionPool(DATABASE_URL, open=False, kwargs={"row_factory": dict_row})


@asynccontextmanager
async def lifespan(app: FastAPI):
    await pool.open()
    # Create the table on startup too, so schema.sql is optional
    async with pool.connection() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
                id          BIGSERIAL PRIMARY KEY,
                name        TEXT        NOT NULL,
                description TEXT,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    yield
    await pool.close()


app = FastAPI(lifespan=lifespan)


class ItemIn(BaseModel):
    name: str
    description: str | None = None


class Item(ItemIn):
    id: int
    created_at: datetime


@app.get("/items", response_model=list[Item])
async def list_items():
    async with pool.connection() as conn:
        cur = await conn.execute("SELECT * FROM items ORDER BY id")
        return await cur.fetchall()


@app.get("/items/{item_id}", response_model=Item)
async def get_item(item_id: int):
    async with pool.connection() as conn:
        cur = await conn.execute("SELECT * FROM items WHERE id = %s", (item_id,))
        row = await cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return row


@app.post("/items", response_model=Item, status_code=201)
async def add_item(item: ItemIn):
    async with pool.connection() as conn:
        cur = await conn.execute(
            "INSERT INTO items (name, description) VALUES (%s, %s) RETURNING *",
            (item.name, item.description),
        )
        return await cur.fetchone()


@app.delete("/items/{item_id}", status_code=204)
async def remove_item(item_id: int):
    async with pool.connection() as conn:
        cur = await conn.execute("DELETE FROM items WHERE id = %s", (item_id,))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Item not found")