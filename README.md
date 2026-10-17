# SafeStep

```
SafeStep/
├── backend/    FastAPI + Tiger Data (Postgres) + Clerk login checks
└── frontend/   Expo (React Native) app, signs in with Clerk and calls the backend
```

How the pieces connect:

```
Phone app ──sign in──▶ Clerk ──token──▶ Phone app
Phone app ──request + token──▶ FastAPI ──▶ Tiger Data (users, care_links)
```

## 1. Clerk setup (once)

In the Clerk Dashboard, under **User & authentication**, make sure **Email** and
**Password** are turned on. The app signs users in with email + password and
confirms new accounts with an emailed code.

## 2. Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env      # then fill in your keys (or copy your existing .env here)
uvicorn main:app --reload --host 0.0.0.0
```

`--host 0.0.0.0` lets your phone reach the backend over Wi-Fi. If the phone
can't connect, allow Python through Windows Firewall (private networks).

- API docs: http://localhost:8000/docs
- Test page: http://localhost:8000/dev (dev only; remove before launch)

Tables (`users`, `care_links`) are created automatically on startup from `schema.sql`.

## 3. Frontend

```powershell
cd frontend
npm install
copy .env.example .env      # then paste your Clerk publishable key
npx expo start
```

Scan the QR code with **Expo Go** (phone on the same Wi-Fi as your computer),
or press `w` to open it in a browser.

The app finds the backend automatically at `http://<your computer>:8000`.
If that doesn't work, set `EXPO_PUBLIC_API_URL` in `frontend/.env`. The address
it's using is shown at the bottom of the Settings tab.

## What the app does

1. **Sign in / sign up** with email + password (Clerk).
2. **First sign-in:** pick *patient* or *caretaker* (`POST /me`).
3. **People tab:** pair with your patient/caretaker by their email
   (`POST /me/link`), see who you're paired with (`GET /me/partner`), or unpair
   (`DELETE /me/link`).
4. **Settings tab:** your account details and sign out.

## API

| Method | Path | What it does |
|---|---|---|
| GET | `/me` | Your profile |
| POST | `/me` | Register after first sign-in: `{"role": "patient" \| "caretaker"}` |
| POST | `/me/link` | Pair with your patient/caretaker: `{"partner_email": "..."}` |
| DELETE | `/me/link` | Unpair |
| GET | `/me/partner` | Your paired patient or caretaker |
| GET/POST/DELETE | `/users`, `/links` | Admin-style routes (any signed-in user; lock down before launch) |

Every route needs `Authorization: Bearer <Clerk session token>`.

## Secrets

`.env` files and Tiger credential files are git-ignored. Never commit them.
