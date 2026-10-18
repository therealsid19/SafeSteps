// POST /falls/escalate against a throwaway Postgres (TEST_DATABASE_URL, same rules as
// care-links.test.ts). The session and Expo's push API (fetch) are mocked.
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { unsafeTestDbReason } from "../db/test-db";
import * as schema from "../db/schema";
import { careLinks, fallIncidents, pushTokens, user } from "../db/schema";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (TEST_DATABASE_URL) {
  const reason = unsafeTestDbReason(TEST_DATABASE_URL, process.env.DATABASE_URL);
  if (reason) throw new Error(`Refusing to run DB tests: ${reason}`);
}

describe.skipIf(!TEST_DATABASE_URL)("POST /falls/escalate (DB)", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let app: { request: (path: string, init: RequestInit) => Response | Promise<Response> };

  const tag = randomUUID().slice(0, 8);
  const patientId = `test-${tag}-patient`;
  const caretakerId = `test-${tag}-caretaker`;
  let sessionUserId = patientId;

  // Expo's push API. Each call records the message; failNext makes the next one fail.
  const pushes: { data: Record<string, unknown> }[] = [];
  let failNext = false;
  const realFetch = globalThis.fetch;
  const sendPush = {
    calls: () => pushes.length,
    last: () => pushes[pushes.length - 1].data,
  };

  beforeAll(async () => {
    client = postgres(TEST_DATABASE_URL!, { prepare: false, max: 5, onnotice: () => {} });
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: `${import.meta.dir}/../../drizzle` });

    mock.module("../db", () => ({ db }));
    mock.module("../auth", () => ({
      auth: { api: { getSession: async () => ({ user: { id: sessionUserId } }) } },
    }));
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      pushes.push(JSON.parse(String(init?.body)));
      if (failNext) {
        failNext = false;
        return new Response("{}", { status: 503 });
      }
      return new Response(JSON.stringify({ data: { status: "ok", id: "ticket" } }));
    }) as typeof fetch;
    app = (await import("./falls")).falls;

    await db.insert(user).values([
      { id: patientId, name: "Pat", email: `${patientId}@example.test`, role: "patient" },
      { id: caretakerId, name: "Cara", email: `${caretakerId}@example.test`, role: "caretaker" },
    ]);
    await db.insert(careLinks).values({ patientId, caretakerId });
    await db
      .insert(pushTokens)
      .values({ userId: caretakerId, token: `ExponentPushToken[${tag}]`, platform: "ios" });
  });

  afterAll(async () => {
    await db.delete(user).where(inArray(user.id, [patientId, caretakerId])); // cascades
    await client.end();
    globalThis.fetch = realFetch;
  });

  beforeEach(() => {
    sessionUserId = patientId;
    pushes.length = 0;
    failNext = false;
  });

  const escalate = (body: Record<string, unknown>) =>
    app.request("/escalate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const incidentsFor = (clientAlertId: string) =>
    db.select().from(fallIncidents).where(eq(fallIncidents.clientAlertId, clientAlertId));

  test("sends one push and stores one incident", async () => {
    const clientAlertId = randomUUID();
    const res = await escalate({ clientAlertId, reason: "timeout", detectedAt: new Date().toISOString() });

    expect(res.status).toBe(201);
    expect((await res.json()).alertStatus).toBe("sent");
    expect(sendPush.calls()).toBe(1);
    expect(sendPush.last()).toMatchObject({ patientId, patientName: "Pat" });
    expect(await incidentsFor(clientAlertId)).toHaveLength(1);
  });

  test("a retry with the same clientAlertId doesn't push or store again", async () => {
    const clientAlertId = randomUUID();
    const body = { clientAlertId, reason: "help", detectedAt: new Date().toISOString() };
    expect((await escalate(body)).status).toBe(201);

    const retry = await escalate(body);
    expect(retry.status).toBe(200);
    expect((await retry.json()).alertStatus).toBe("sent");
    expect(sendPush.calls()).toBe(1);
    expect(await incidentsFor(clientAlertId)).toHaveLength(1);
  });

  test("concurrent retries still send only once", async () => {
    const clientAlertId = randomUUID();
    const body = { clientAlertId, reason: "help", detectedAt: new Date().toISOString() };
    const results = await Promise.all([escalate(body), escalate(body), escalate(body)]);

    expect(results.every((r) => r.status < 300)).toBe(true);
    expect(sendPush.calls()).toBe(1);
    expect(await incidentsFor(clientAlertId)).toHaveLength(1);
  });

  test("a retry after a failed push tries again", async () => {
    const clientAlertId = randomUUID();
    const body = { clientAlertId, reason: "timeout", detectedAt: new Date().toISOString() };
    failNext = true;

    const first = await escalate(body);
    expect(first.status).toBe(202);
    expect((await first.json()).alertStatus).toBe("failed");

    const retry = await escalate(body);
    expect(retry.status).toBe(201);
    expect((await retry.json()).alertStatus).toBe("sent");
    expect(sendPush.calls()).toBe(2);
    const [incident] = await incidentsFor(clientAlertId);
    expect(incident.alertStatus).toBe("sent");
  });

  test("a phone clock running fast still alerts, using the server's time", async () => {
    const clientAlertId = randomUUID();
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    const res = await escalate({ clientAlertId, reason: "timeout", detectedAt: future });

    expect(res.status).toBe(201);
    const [incident] = await incidentsFor(clientAlertId);
    expect(incident.detectedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test("rejects a missing clientAlertId and reuse by another patient", async () => {
    const noId = await escalate({ reason: "timeout", detectedAt: new Date().toISOString() });
    expect(noId.status).toBe(400);

    const clientAlertId = randomUUID();
    const body = { clientAlertId, reason: "timeout", detectedAt: new Date().toISOString() };
    expect((await escalate(body)).status).toBe(201);

    const otherPatient = `test-${tag}-other`;
    await db.insert(user).values({ id: otherPatient, name: "O", email: `${otherPatient}@example.test`, role: "patient" });
    await db.insert(careLinks).values({ patientId: otherPatient, caretakerId });
    sessionUserId = otherPatient;
    try {
      expect((await escalate(body)).status).toBe(409);
    } finally {
      await db.delete(user).where(eq(user.id, otherPatient));
    }
  });
});
