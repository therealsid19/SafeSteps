# SafeStep backend

Hono + Bun, [Better Auth](https://www.better-auth.com) (Google sign-in), Drizzle ORM on Tiger Data (Postgres).

## Setup

1. `bun install`
2. `cp .env.example .env` and fill it in.
3. Google Cloud Console:
   - Create an **OAuth client ID** (type *Web application*).
   - Authorized redirect URI: `$BETTER_AUTH_URL/api/auth/callback/google`
     (e.g. `http://localhost:8000/api/auth/callback/google`).
   - Enable the **People API** (used to read the phone number on the user's Google account).
   - OAuth consent screen: add the scope `.../auth/user.phonenumbers.read` and add yourself as a test user.
4. Create the tables on Tiger Data: `bun run db:push`
   (or `bun run db:generate && bun run db:migrate` for migration files).
5. `bun run dev` → http://localhost:8000

## Phone numbers

On the first Google sign-in we ask Google for the phone number on the account.
Most Google accounts don't share one, so the app also asks for it on the role screen,
prefilled with Google's value when there is one.

## Routes

- `/api/auth/*` — Better Auth (sign in with Google, session, sign out)
- `GET /me` — your profile (404 until you pick a role)
- `POST /me` `{ role, phone_number }` — finish sign-up
- `PATCH /me` `{ phone_number }` — change your phone number
- `GET /me/partner`, `POST /me/link` `{ partner_email }`, `DELETE /me/link`

After changing `src/auth.ts` (e.g. adding user fields or plugins), run `bun run auth:generate`
to regenerate `src/db/auth-schema.ts`, then `bun run db:push`.
