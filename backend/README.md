# SafeStep backend

TypeScript server that texts the caretaker when the app detects a fall or the
patient asks for help. Texts go out through Twilio, so nobody has to tap Send.
Runs on **Node** (20+) or **Bun** with the same code.

## Run it locally

```bash
cd backend
npm install            # or: bun install
cp .env.example .env   # fill in SAFESTEP_API_KEY (and Twilio, when ready)

npm run dev            # Node
bun run dev:bun        # Bun
```

It listens on port 8000 (set `PORT` to change it). Without Twilio credentials
it runs in **test mode**: alerts are printed in the terminal instead of being
texted. `GET /health` shows which mode it's in.

Then point the app at it: copy `../.env.example` to `../.env.local`, set
`EXPO_PUBLIC_SAFESTEP_API_URL` to `http://<your computer's local IP>:8000`
and `EXPO_PUBLIC_SAFESTEP_API_KEY` to the same key, and restart `npx expo start`.

## Turn on real texting (Twilio)

1. Create an account at https://console.twilio.com and get a phone number that
   can send SMS.
2. Put the Account SID, Auth Token and that number in `backend/.env`.
3. On a Twilio trial account, texts only reach numbers you've verified in the
   console, and start with a trial notice.

## API

`POST /v1/alerts` with header `X-API-Key`:

```json
{
  "reason": "fall",
  "user_name": "Jeffrey",
  "contacts": [{ "name": "Caretaker", "phone": "+19057363398" }],
  "location": { "latitude": 43.4723, "longitude": -80.5449 }
}
```

`reason` is `"fall"` or `"manual"`. Phones must be in international format.
Returns `sent_count` and a result per contact. Errors: `401` bad key, `422`
invalid request, `429` too many alerts (default 5 per 10 minutes), `502` no
message could be sent.

## Tests

```bash
npm test        # or: bun run test
```

## Before a public release

The API key is built into the app, so it only stops casual abuse. Replace it
with Clerk session tokens verified on the server, and look up the paired
caretaker's number on the server instead of sending it with each request.
