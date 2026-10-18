# SafeStep

Fall detection and caretaker alerting. `frontend/` is the Expo app (read `frontend/AGENTS.md` first), and `backend/auth/` is the Hono + Bun + Drizzle API on Tiger Data.

The fall alert system spec is `docs/specs/fall-alert-system.md`. It is the source of truth for alerts, escalation, the worker, and notifications.

## Workflow for fall alert work

This is a safety system, so every change goes through implement → review → fix:

1. Split the work into small tasks (one route, one migration, one worker step, one screen).
2. For each task, use the `implementer` agent. It writes tests first and runs verification.
3. Then run `spec-reviewer` and `safety-reviewer` **in parallel** on the result. Both are read-only.
4. Send any BLOCKER or SHOULD-FIX findings back to the implementer (continue the same agent with SendMessage). Then review again. Stop after 3 rounds and bring whatever is still open to the user instead of looping.
5. A task is done only when both reviewers say `APPROVE` and the verification commands pass. Report the real output.

Before merging a branch, also run `/code-review` on the whole diff.

## Verification commands

```bash
cd backend/auth && bunx tsc --noEmit && bun test
cd frontend && bunx tsc --noEmit && bunx expo lint
```

## Decisions (Oct 18, 2026)

- Each patient has exactly one caretaker; a caretaker has at most 5 patients.
- User ids are Better Auth text ids (`user.id`). No separate users table.
- Schema is Drizzle (`backend/auth/src/db/schema.ts`), migrated with drizzle-kit. Hypertable and retention calls go in a custom migration (`bunx drizzle-kit generate --custom`). Add every new table to `tablesFilter` in `drizzle.config.ts`.

## Known gotchas

- The DB client connects through Tiger's transaction-mode pooler (`prepare: false`). `LISTEN/NOTIFY` needs a direct connection for the worker.
