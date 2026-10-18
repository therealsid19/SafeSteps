# Fall Alert System — Technical Spec

Oct 18, 2026 · @Jeffrey

## Overview

When a patient's phone detects a fall and the patient doesn't cancel within 30 seconds, the patient's caretaker gets an urgent alert. If nobody acknowledges it, the alert escalates by push, then SMS, then a phone call, until someone does. The stack is a React Native app built with Expo (one app, two roles: patient and caretaker), a Hono API on Bun, and Tiger Data (Postgres) as the only datastore.

This is a safety system, so the design rule is: **an alert is not done when it is sent, only when a human acknowledges it.** Everything below follows from that.

## Targets

| Measure | Target |
|---|---|
| Fall confirmed → first caretaker push sent | p95 under 3 s |
| Unacknowledged alert → SMS fallback | 60 s after first push |
| Unacknowledged alert → voice call | 2 min after first push |
| Alerts lost (never delivered by any channel, never acknowledged) | 0; every one is visible on an on-call dashboard |

## Non-goals for v1

- Calling emergency services automatically. The caretaker decides; the app gives them a one-tap call button.
- Wearable integrations (Apple Watch, Wear OS).
- Medical diagnosis or any claim that the app detects every fall.

## Assumptions

- The Expo app uses EAS Build (a development build, not Expo Go), so it can include native config such as critical-alert entitlements and an Android foreground service.
- Push goes through Expo's push service, which forwards to APNs and FCM. The server never talks to Firebase; FCM credentials are uploaded to EAS once.
- SMS and voice go through Twilio.
- Each patient has exactly one caretaker. A caretaker can look after at most 5 patients. Linking a 6th returns `409 caretaker_full`.
- User ids are Better Auth's text ids (`user.id`). There is no separate `users` table; role and phone live on Better Auth's `user` table.
- The schema is defined with Drizzle in `backend/auth/src/db/schema.ts` and migrated with drizzle-kit.

## Architecture

The API only records the alert and queues work. A separate worker process does all sending and all escalation timing, using the database as its queue and clock. Nothing runs in memory that would be lost on a restart.

1. **Patient app** detects a likely fall, shows a 30-second "Are you OK?" countdown, and calls `POST /v1/alerts` if the patient doesn't cancel. It also sends a heartbeat every 5 minutes.
2. **Hono API (Bun)** stores the alert, creates the first escalation step for the caretaker, and runs `NOTIFY alert_jobs` in the same transaction.
3. **Tiger Data** holds alerts, the job queue, delivery attempts, and patient heartbeats (a hypertable).
4. **Worker (Bun)** claims due jobs with `FOR UPDATE SKIP LOCKED`, sends them, and schedules the next escalation step as a future job (`run_at`). Acknowledging an alert cancels all its pending steps.
5. **Expo Push** delivers to caretaker phones via APNs and FCM. **Twilio** sends SMS and places voice calls.
6. **Caretaker app** shows a full-screen alert with "I'm on it" and "Call patient" buttons. "I'm on it" calls `POST /v1/alerts/:id/ack`.

The worker runs as its own Bun process (`bun run src/worker/index.ts`) from the same repo. Run at least two copies in production so a crash or deploy never pauses escalation.

## Fall detection in the patient app

Detection runs on the phone and errs toward false alarms, because the 30-second countdown lets the patient cancel them cheaply. A missed fall is far worse than a cancelled one.

**Detector (v1, heuristic)** — reads `expo-sensors` Accelerometer at 50 Hz and flags a fall when all three happen in order:

1. Free fall: total acceleration under 0.4 g for at least 80 ms.
2. Impact: a spike over 2.5 g within 1 s after the free fall.
3. Stillness: acceleration stays within 0.9–1.1 g for 3 s after impact.

The thresholds live in one config file and are sent up with every alert, so they can be tuned from real data. Treat them as starting values, not validated ones.

**Countdown screen** — full screen, loud tone, vibration, a large "I'm OK" button and a smaller "Get help now" button. No tap for 30 s sends the alert. "Get help now" sends it at once.

**Manual SOS** — a large button on the patient home screen, plus a lock-screen notification action, sends an alert with `source = 'manual'`. This is the fallback for every detection gap below.

**Running in the background** — this is the hardest part of the project.

| Platform | Approach | Limit |
|---|---|---|
| Android | A foreground service with a persistent notification keeps the sensor loop alive. Needs a small native module or a config plugin; `expo-task-manager` alone does not stream sensors. | Some manufacturers still kill background apps; onboarding must walk the patient through disabling battery optimisation. |
| iOS | No supported way for a third-party app to stream the accelerometer continuously in the background. | v1 detects falls only while the app is in the foreground. Manual SOS works any time. See Open questions. |

**Offline** — if `POST /v1/alerts` fails, the app retries every 5 s with the same `clientAlertId`, and after 60 s offers to text the caretaker directly from the phone's SMS app.

**Heartbeat** — the app sends `POST /v1/heartbeat` every 5 minutes with battery level and whether detection is active. If a patient goes silent for 30 minutes, the caretaker gets a low-priority "monitoring is off" notice, so nobody wrongly assumes they're covered.

## Data model

Seven tables plus Better Auth's `user`. Alerts are plain Postgres rows, because they are updated as they move through their lifecycle; only `heartbeats` is a hypertable. Tables are defined with Drizzle in `backend/auth/src/db/schema.ts` and migrated with drizzle-kit (`bun run db:generate`, `bun run db:migrate`). Anything Drizzle can't express (the hypertable, the retention policy) goes in a custom migration made with `bunx drizzle-kit generate --custom`. Every new table must be added to `tablesFilter` in `drizzle.config.ts`. All user references are `text` and point at `user.id`.

| Table | Purpose | Key columns |
|---|---|---|
| user (Better Auth) | Patients and caretakers | id text pk, name, email, phone_number, role (patient, caretaker) |
| care_links | Who looks after whom | patient_id text unique, caretaker_id text, created_at; pk (patient_id, caretaker_id); index on caretaker_id; at most 5 rows per caretaker_id |
| devices | Where pushes go | id uuid pk, user_id text, expo_push_token unique, platform, critical_alerts_granted bool, last_seen_at |
| alerts | One per fall or SOS | id uuid pk, patient_id text, client_alert_id unique, source (fall, manual), status, detected_at, location jsonb null, detector jsonb, acked_by text, acked_at, resolved_at, resolution text |
| alert_jobs | Queue of escalation steps | id bigserial pk, alert_id, caretaker_id text, channel (push, sms, voice), step int, status, run_at, attempts, locked_at, last_error |
| deliveries | Every send attempt and its outcome | id, job_id, provider, provider_ref (Expo ticket id or Twilio SID), status (sent, delivered, failed), error, created_at |
| alert_events | Audit trail | alert_id, at, actor_id text null, type (created, escalated, acked, resolved, cancelled), detail jsonb |
| heartbeats (hypertable) | Is monitoring alive | patient_id text, time, battery_pct, detection_active bool, app_version |

The SQL below shows the intended result; write it as Drizzle schema, not raw SQL, except for the custom migration.

```sql
CREATE TYPE alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'cancelled');
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'done', 'failed', 'cancelled');

CREATE TABLE alert_jobs (
  id bigserial PRIMARY KEY,
  alert_id uuid NOT NULL REFERENCES alerts(id),
  caretaker_id text REFERENCES "user"(id),
  channel text NOT NULL CHECK (channel IN ('push', 'sms', 'voice')),
  step int NOT NULL,
  status job_status NOT NULL DEFAULT 'pending',
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 0,
  locked_at timestamptz,
  last_error text,
  UNIQUE (alert_id, caretaker_id, channel, step)
);
CREATE INDEX ON alert_jobs (run_at) WHERE status = 'pending';

SELECT create_hypertable('heartbeats', 'time', chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('heartbeats', INTERVAL '90 days');
```

The `UNIQUE (alert_id, caretaker_id, channel, step)` constraint makes scheduling idempotent: if two workers both try to schedule the next step, the second insert is a no-op.

## API

All routes are under `/v1`, JSON in and out, validated with Zod through `@hono/zod-validator`, and authenticated by middleware that sets `c.get('user')`. Errors return `{ error: { code, message } }`.

| Method | Path | Who | Body | Behaviour |
|---|---|---|---|---|
| POST | /devices | any | `{ expoPushToken, platform, criticalAlertsGranted }` | Upsert by token; reassign it if it moved to a new user. 201 |
| DELETE | /devices/:id | owner | none | Remove on logout. 204 |
| POST | /alerts | patient | `{ clientAlertId, source, detectedAt, location?, detector? }` | Create the alert and its step-0 job in one transaction. Idempotent on clientAlertId. 201 `{ alertId }` |
| POST | /alerts/:id/cancel | patient | none | Only within 2 min of creation and only if not yet acknowledged. Cancels pending jobs and sends the caretaker a "false alarm" push. |
| POST | /alerts/:id/ack | linked caretaker | none | First ack wins: sets acked_by, cancels all pending jobs. The caretaker can ack from the app, an SMS reply and a voice keypress at once, so a later ack returns 200 with the existing ack. |
| POST | /alerts/:id/resolve | linked caretaker | `{ resolution }` | Closes the alert with a note (ok, injured, ems_called, false_alarm). |
| GET | /alerts/:id | patient or linked caretaker | none | Alert, its timeline from alert_events, and delivery status per caretaker. |
| GET | /alerts?status=open | caretaker | none | Open alerts for all linked patients, newest first. |
| POST | /heartbeat | patient | `{ batteryPct, detectionActive, appVersion }` | Insert one heartbeat row. 204 |
| POST | /twilio/status | Twilio | form data | Delivery callbacks. Verified with the X-Twilio-Signature header, not user auth. |

### Rules

1. A caretaker can only see or act on alerts for patients they have a care_link to (a link exists only while paired; unpairing deletes it). Anything else returns **404, not 403**, so alert ids can't be probed.
2. `POST /alerts` with no linked caretaker still stores the alert, returns `409 no_caretaker`, and the app tells the patient to call someone directly.
3. The ack, cancel and resolve routes use `UPDATE ... WHERE status = 'open'` (or `'acknowledged'` for resolve) and check the row count, so concurrent acks (app, SMS, voice) or an ack racing a cancel can't both win.
4. Every state change writes an `alert_events` row in the same transaction.

## Delivery and escalation

With one caretaker per patient there is no second person to fall back to. The 10-minute "unreached" flag on the on-call dashboard is the only backstop, so it must page someone.


Escalation is driven by acknowledgement, never by delivery receipts. A push that Apple reports as delivered still escalates if nobody taps "I'm on it".

### Escalation schedule

Times from alert creation; the schedule lives in `src/escalation/schedule.ts`.

| Step | At | Channel | To |
|---|---|---|---|
| 0 | 0 s | Critical push | The caretaker |
| 1 | 60 s | SMS + repeat push | The caretaker |
| 2 | 120 s | Voice call | The caretaker |
| 3+ | every 5 min after that | Voice call + push | The caretaker, until acked |
| — | 10 min | Flag unreached | On-call dashboard for your team |

When the worker finishes a step for an alert that is still open, it inserts the next step's jobs with `run_at` set to the scheduled time. An ack sets all pending jobs for that alert to `cancelled` in the same transaction, and the worker re-checks `alerts.status` right before every send, so nothing goes out after an ack.

### Worker loop

```sql
UPDATE alert_jobs
SET status = 'processing', locked_at = now(), attempts = attempts + 1
WHERE id IN (
  SELECT id FROM alert_jobs
  WHERE status = 'pending' AND run_at <= now()
  ORDER BY run_at
  LIMIT 50
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

The worker wakes on `LISTEN alert_jobs` and also polls every 1 s, because escalation steps are future jobs that no NOTIFY announces. A reaper returns jobs stuck in `processing` for over 30 s to `pending`. A failed send retries after 2 s, 5 s and 10 s, then marks the job `failed`; the escalation schedule continues regardless.

### Expo Push

Sent with the `expo-server-sdk` package (runs on Bun), batches of up to 100.

```ts
{
  to: device.expoPushToken,
  title: 'Possible fall: Margaret',
  body: 'Tap to respond. Detected 9:42 PM.',
  data: { alertId },
  priority: 'high',
  channelId: 'fall-alerts',                 // Android channel created by the app
  categoryId: 'fall_alert',                 // shows "I'm on it" and "Call" buttons
  sound: 'alarm.wav',
  interruptionLevel: device.criticalAlertsGranted ? 'critical' : 'time-sensitive',
  ttl: 300,
}
```

Expo returns a ticket per message. Store the ticket id in `deliveries`. A separate job fetches receipts about 15 minutes later: `DeviceNotRegistered` deletes the device; other errors are logged and counted. Never wait on receipts before escalating.

### Twilio

- **SMS:** "Possible fall: Margaret, 9:42 PM. Open the app or reply 1 to respond." An inbound SMS webhook treats a reply of `1` from a linked caretaker's number as an ack.
- **Voice:** TwiML reads the same message and gathers one keypress. Pressing 1 hits `POST /v1/twilio/voice-ack`, which acks the alert. Both webhooks verify `X-Twilio-Signature`.
- Status callbacks update `deliveries`. A call that is busy or unanswered does not retry on its own; the next escalation step covers it.

## Caretaker app

The caretaker side must get through silent mode and Do Not Disturb, and let the caretaker respond in one tap from the lock screen.

### iOS critical alerts

- Critical alerts play sound even on silent and in Focus modes. They need the `com.apple.developer.usernotifications.critical-alerts` entitlement, which Apple grants only on application. Apply early; approval can take weeks.
- Until it's granted, send `interruptionLevel: 'time-sensitive'` (needs the Time Sensitive Notifications capability), which breaks through most Focus modes but not the silent switch.
- Ask for permission with `Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowCriticalAlerts: true } })` and report the result in `devices.critical_alerts_granted`.

### Android channel

- On first launch, create the `fall-alerts` channel with `Notifications.setNotificationChannelAsync`: importance MAX, a custom alarm sound, vibration, `bypassDnd: true`, and lock-screen visibility PUBLIC.
- Onboarding checks the channel is still enabled and at full importance (users can turn it down) and sends them to settings if not.

### Respond from the notification

- Register a `fall_alert` notification category with two actions: "I'm on it" (acknowledge without opening the app) and "Call" (opens the app and dials the patient).
- A notification response listener handles the action, calls `POST /v1/alerts/:id/ack`, and retries in the background if offline.

### Alert screen

- Tapping the notification opens a full-screen alert: patient name, time, location on a map if available, and how long ago it happened.
- Buttons: "I'm on it", "Call patient", "Call 911". After acking: a resolve form with the four resolutions.
- A timeline shows what was sent (push, SMS, call) and when.

### Setup checks

On every launch, the app re-registers its push token, checks notification permissions and the Android channel, and shows a red banner if alerts can't get through. A "Send test alert" button runs a real alert end to end, marked as a test.

## Reliability, security and privacy

### Reliability

- At least two API instances and two worker instances in production, in different zones if your host allows it.
- The worker writes a heartbeat row every 10 s. An external uptime monitor alerts your team if it is more than 30 s old, or if any open alert has a pending job more than 15 s overdue.
- Dashboard metrics: time from alert to first push sent, time to ack (p50, p95), alerts reaching each escalation step, unreached alerts, Expo and Twilio error rates.
- Deploys drain the worker (stop claiming, finish in-flight jobs) before stopping it.
- A weekly synthetic test alert runs through production against a test patient and a test caretaker, and pages your team if it isn't acked by the test harness within 10 s.

### Security

- Every query that touches alerts joins through `care_links` for the current user. **This is the most important review check.**
- Twilio webhooks verify the signature. Expo access token ("enhanced push security") is enabled so only your server can send to your app's tokens.
- Secrets come from environment variables only: `EXPO_ACCESS_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `DATABASE_URL`.
- Push tokens and phone numbers never appear in logs; log their row ids.

### Privacy

- Fall alerts and locations are personal health information. In Ontario that means PHIPA if you work with health providers, and PIPEDA otherwise; if you serve US users, HIPAA may apply. Get a privacy review before launch. This spec isn't legal advice.
- Push and SMS text says "possible fall" and the patient's first name only. Location and details load inside the app after sign-in, never in the notification payload.
- Keep alert locations for 30 days, then null them. Keep alerts and audit events for as long as your privacy review requires.
- Marketing copy and the app must not claim to detect all falls or replace emergency services. Claims like that can make the app a regulated medical device.
