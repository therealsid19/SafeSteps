// Care link tests. The DB tests run only against TEST_DATABASE_URL (a throwaway
// Postgres), never DATABASE_URL. They apply ./drizzle migrations to it and only
// touch users they create (ids prefixed with a per-run random tag).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import {
  createLink,
  findCaretaker,
  findPatientLocation,
  hasRoomForPatient,
  listPatients,
  unlinkAsCaretaker,
  unlinkAsPatient,
  type Db,
} from "./care-links";
import * as schema from "./schema";
import { MAX_PATIENTS_PER_CARETAKER, patientLocation, user } from "./schema";

describe("hasRoomForPatient", () => {
  test("allows up to MAX_PATIENTS_PER_CARETAKER patients", () => {
    expect(MAX_PATIENTS_PER_CARETAKER).toBe(5);
    expect(hasRoomForPatient(0)).toBe(true);
    expect(hasRoomForPatient(4)).toBe(true);
    expect(hasRoomForPatient(5)).toBe(false);
    expect(hasRoomForPatient(6)).toBe(false);
  });
});

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]", "db"];

/**
 * Why TEST_DATABASE_URL is unsafe to run destructive tests against, or null if it's fine.
 * It must be a local host (or the compose `db` service) or a database named *_test,
 * and must not share host:port with DATABASE_URL (which Bun loads from .env).
 */
export function unsafeTestDbReason(testUrl: string, mainUrl: string | undefined): string | null {
  let test: URL;
  try {
    test = new URL(testUrl);
  } catch {
    return "TEST_DATABASE_URL is not a valid URL";
  }
  const hostPort = (u: URL) => `${u.hostname.toLowerCase()}:${u.port || "5432"}`;
  const dbName = decodeURIComponent(test.pathname.replace(/^\//, ""));
  if (!LOCAL_HOSTS.includes(test.hostname.toLowerCase()) && !dbName.endsWith("_test")) {
    return `TEST_DATABASE_URL must point at localhost/127.0.0.1/::1/db or a database whose name ends in _test (got host ${test.hostname}, database ${dbName || "(none)"})`;
  }
  if (mainUrl) {
    let main: URL | null = null;
    try {
      main = new URL(mainUrl);
    } catch {
      // An unparseable DATABASE_URL can't match.
    }
    if (main && hostPort(main) === hostPort(test)) {
      return `TEST_DATABASE_URL has the same host:port as DATABASE_URL (${hostPort(test)}); refusing to run against the app database`;
    }
  }
  return null;
}

describe("unsafeTestDbReason", () => {
  const tiger = "postgres://u:p@abc123.tsdb.cloud.timescale.com:34567/tsdb";
  test("allows a local database", () => {
    expect(unsafeTestDbReason("postgres://test@localhost:55432/anything", tiger)).toBeNull();
    expect(unsafeTestDbReason("postgres://test@127.0.0.1/x", tiger)).toBeNull();
    expect(unsafeTestDbReason("postgres://test@[::1]:5433/x", tiger)).toBeNull();
    expect(unsafeTestDbReason("postgres://test@db:5432/x", tiger)).toBeNull();
  });
  test("allows a remote database named *_test on another host", () => {
    expect(unsafeTestDbReason("postgres://u@ci.example.com/safestep_test", tiger)).toBeNull();
  });
  test("refuses a remote database not named *_test", () => {
    expect(unsafeTestDbReason("postgres://u@ci.example.com/safestep", tiger)).toContain("_test");
  });
  test("refuses the same host:port as DATABASE_URL, even with a _test name", () => {
    expect(
      unsafeTestDbReason("postgres://u:p@abc123.tsdb.cloud.timescale.com:34567/tsdb_test", tiger),
    ).toContain("same host:port");
    expect(
      unsafeTestDbReason("postgres://test@localhost/safestep_test", "postgres://a@localhost:5432/safestep"),
    ).toContain("same host:port");
  });
  test("refuses an invalid URL", () => {
    expect(unsafeTestDbReason("not a url", tiger)).toContain("not a valid URL");
  });
});

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (TEST_DATABASE_URL) {
  const reason = unsafeTestDbReason(TEST_DATABASE_URL, process.env.DATABASE_URL);
  // Throwing here fails the whole file loudly instead of skipping.
  if (reason) throw new Error(`Refusing to run DB tests: ${reason}`);
} else {
  console.warn("Skipping care_links DB tests: set TEST_DATABASE_URL to a throwaway Postgres to run them.");
}

describe.skipIf(!TEST_DATABASE_URL)("care_links (DB)", () => {
  let client: ReturnType<typeof postgres>;
  let db: Db;
  const tag = randomUUID().slice(0, 8);
  const created: string[] = [];

  async function makeUser(role: "patient" | "caretaker") {
    const id = `test-${tag}-${role}-${created.length}`;
    created.push(id);
    await db.insert(user).values({ id, name: id, email: `${id}@example.test`, role });
    return id;
  }

  const makePatients = (n: number) => Promise.all(Array.from({ length: n }, () => makeUser("patient")));

  async function linkAll(caretakerId: string, patientIds: string[]) {
    // One at a time so created_at order is the array order.
    for (const p of patientIds) expect((await createLink(db, p, caretakerId)).ok).toBe(true);
  }

  beforeAll(async () => {
    client = postgres(TEST_DATABASE_URL!, { prepare: false, max: 10, onnotice: () => {} });
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: `${import.meta.dir}/../../drizzle` });
  });

  afterAll(async () => {
    if (created.length) await db.delete(user).where(inArray(user.id, created)); // cascades to care_links
    await client.end();
  });

  describe("createLink cap", () => {
    test("a caretaker can link 5 patients and the 6th is caretaker_full", async () => {
      const caretaker = await makeUser("caretaker");
      const patients = await makePatients(6);
      await linkAll(caretaker, patients.slice(0, 5));

      expect(await createLink(db, patients[5], caretaker)).toEqual({ ok: false, reason: "caretaker_full" });
      expect(await listPatients(db, caretaker)).toHaveLength(5);
    });

    test("a caretaker who no longer exists gets not_found, not an FK error", async () => {
      const [patient] = await makePatients(1);
      expect(await createLink(db, patient, `test-${tag}-deleted-caretaker`)).toEqual({
        ok: false,
        reason: "not_found",
      });
      expect(await findCaretaker(db, patient)).toBeNull();
    });

    test("a patient who already has a caretaker gets patient_linked", async () => {
      const [c1, c2] = [await makeUser("caretaker"), await makeUser("caretaker")];
      const [patient] = await makePatients(1);
      await linkAll(c1, [patient]);

      expect(await createLink(db, patient, c2)).toEqual({ ok: false, reason: "patient_linked" });
      expect(await createLink(db, patient, c1)).toEqual({ ok: false, reason: "patient_linked" });
      expect((await findCaretaker(db, patient))?.id).toBe(c1);
    });

    test("two concurrent links to a caretaker with 4 patients: exactly one wins", async () => {
      const caretaker = await makeUser("caretaker");
      const patients = await makePatients(6);
      await linkAll(caretaker, patients.slice(0, 4));

      const results = await Promise.all([
        createLink(db, patients[4], caretaker),
        createLink(db, patients[5], caretaker),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok && r.reason === "caretaker_full")).toHaveLength(1);
      expect(await listPatients(db, caretaker)).toHaveLength(5);
    });

    test("many concurrent links never exceed the cap", async () => {
      const caretaker = await makeUser("caretaker");
      const patients = await makePatients(10);
      await linkAll(caretaker, patients.slice(0, 2));

      const results = await Promise.all(patients.slice(2).map((p) => createLink(db, p, caretaker)));
      expect(results.filter((r) => r.ok)).toHaveLength(3);
      expect(await listPatients(db, caretaker)).toHaveLength(5);
    });
  });

  describe("listPatients", () => {
    test("returns only this caretaker's patients, earliest-linked first", async () => {
      const [c1, c2] = [await makeUser("caretaker"), await makeUser("caretaker")];
      const mine = await makePatients(3);
      const theirs = await makePatients(1);
      await linkAll(c1, [mine[2], mine[0], mine[1]]);
      await linkAll(c2, theirs);

      expect((await listPatients(db, c1)).map((u) => u.id)).toEqual([mine[2], mine[0], mine[1]]);
      expect((await listPatients(db, c2)).map((u) => u.id)).toEqual(theirs);
    });

    test("is empty for a caretaker with no patients", async () => {
      expect(await listPatients(db, await makeUser("caretaker"))).toEqual([]);
    });
  });

  describe("unlink scoping", () => {
    test("a caretaker cannot unlink another caretaker's patient", async () => {
      const [c1, c2] = [await makeUser("caretaker"), await makeUser("caretaker")];
      const [p1, p2] = await makePatients(2);
      await linkAll(c1, [p1]);
      await linkAll(c2, [p2]);

      expect(await unlinkAsCaretaker(db, c1, p2)).toEqual({ ok: false, reason: "not_found" });
      expect((await findCaretaker(db, p2))?.id).toBe(c2);
    });

    test("a caretaker with one patient can unlink without patient_id", async () => {
      const caretaker = await makeUser("caretaker");
      const [patient] = await makePatients(1);
      await linkAll(caretaker, [patient]);

      expect(await unlinkAsCaretaker(db, caretaker, undefined)).toEqual({ ok: true });
      expect(await findCaretaker(db, patient)).toBeNull();
    });

    test("a caretaker with several patients must pass patient_id", async () => {
      const caretaker = await makeUser("caretaker");
      const patients = await makePatients(2);
      await linkAll(caretaker, patients);

      expect(await unlinkAsCaretaker(db, caretaker, undefined)).toEqual({
        ok: false,
        reason: "patient_id_required",
      });
      expect(await listPatients(db, caretaker)).toHaveLength(2);

      expect(await unlinkAsCaretaker(db, caretaker, patients[1])).toEqual({ ok: true });
      expect((await listPatients(db, caretaker)).map((u) => u.id)).toEqual([patients[0]]);
    });

    test("a caretaker with no patients gets not_found", async () => {
      expect(await unlinkAsCaretaker(db, await makeUser("caretaker"), undefined)).toEqual({
        ok: false,
        reason: "not_found",
      });
    });

    test("a patient removes only their own link", async () => {
      const caretaker = await makeUser("caretaker");
      const [p1, p2] = await makePatients(2);
      await linkAll(caretaker, [p1, p2]);

      expect(await unlinkAsPatient(db, p1)).toEqual({ ok: true });
      expect((await listPatients(db, caretaker)).map((u) => u.id)).toEqual([p2]);
      expect(await unlinkAsPatient(db, p1)).toEqual({ ok: false, reason: "not_found" });
    });

    test("a caretaker at the cap can link again after unlinking one", async () => {
      const caretaker = await makeUser("caretaker");
      const patients = await makePatients(6);
      await linkAll(caretaker, patients.slice(0, 5));
      expect(await unlinkAsCaretaker(db, caretaker, patients[0])).toEqual({ ok: true });
      expect((await createLink(db, patients[5], caretaker)).ok).toBe(true);
    });
  });

  describe("findPatientLocation", () => {
    test("is scoped through care_links and defaults to the earliest-linked patient", async () => {
      const [c1, c2] = [await makeUser("caretaker"), await makeUser("caretaker")];
      const [p1, p2, other] = await makePatients(3);
      await linkAll(c1, [p1, p2]);
      await linkAll(c2, [other]);
      await db.insert(patientLocation).values([
        { userId: p2, sharingEnabled: true, latitude: 2, longitude: 2 },
        { userId: other, sharingEnabled: true, latitude: 9, longitude: 9 },
      ]);

      // Earliest-linked patient (p1) has no location row: no data, not p2's.
      expect((await findPatientLocation(db, c1))?.sharingEnabled ?? false).toBe(false);
      expect((await findPatientLocation(db, c1, p2))?.latitude).toBe(2);
      // Another caretaker's patient looks the same as no link.
      expect(await findPatientLocation(db, c1, other)).toBeNull();
      expect(await findPatientLocation(db, c1, "no-such-user")).toBeNull();
    });
  });
});
