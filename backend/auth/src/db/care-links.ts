// Care link queries. They take `db` as a parameter (instead of importing src/db)
// so tests can run them against TEST_DATABASE_URL without loading the app's env.
import { and, asc, count, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "./schema";
import { careLinks, MAX_PATIENTS_PER_CARETAKER, patientLocation, user } from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
type UserRow = typeof user.$inferSelect;
type LinkRow = typeof careLinks.$inferSelect;

export type LinkResult =
  | { ok: true; link: LinkRow }
  | { ok: false; reason: "patient_linked" | "caretaker_full" | "not_found" };

type PgError = { code?: string; cause?: unknown };
// Drizzle wraps driver errors in DrizzleQueryError, with the postgres error as `cause`.
const isUniqueViolation = (e: unknown): boolean =>
  (e as PgError)?.code === "23505" || (!!(e as PgError)?.cause && isUniqueViolation((e as PgError).cause));

/** Can a caretaker who already has `current` patients take one more? */
export const hasRoomForPatient = (current: number) => current < MAX_PATIENTS_PER_CARETAKER;

/**
 * Links a patient to a caretaker. The caretaker's user row is locked FOR UPDATE
 * first, so concurrent links to the same caretaker run one at a time and the count
 * can't go past MAX_PATIENTS_PER_CARETAKER. patient_id is unique, so a patient who
 * already has a caretaker fails with a unique violation.
 */
export async function createLink(db: Db, patientId: string, caretakerId: string): Promise<LinkResult> {
  try {
    return await db.transaction(async (tx) => {
      const locked = await tx.select({ id: user.id }).from(user).where(eq(user.id, caretakerId)).for("update");
      // The caretaker was deleted after the route looked them up.
      if (locked.length === 0) return { ok: false, reason: "not_found" } as const;

      const [{ n }] = await tx
        .select({ n: count() })
        .from(careLinks)
        .where(eq(careLinks.caretakerId, caretakerId));
      if (!hasRoomForPatient(n)) return { ok: false, reason: "caretaker_full" } as const;

      const [link] = await tx.insert(careLinks).values({ patientId, caretakerId }).returning();
      return { ok: true, link } as const;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: "patient_linked" };
    throw e;
  }
}

/** The patient's caretaker, or null. */
export async function findCaretaker(db: Db, patientId: string): Promise<UserRow | null> {
  const [row] = await db
    .select({ caretaker: user })
    .from(careLinks)
    .innerJoin(user, eq(user.id, careLinks.caretakerId))
    .where(eq(careLinks.patientId, patientId))
    .limit(1);
  return row?.caretaker ?? null;
}

/** The caretaker's patients, earliest-linked first. */
export async function listPatients(db: Db, caretakerId: string): Promise<UserRow[]> {
  const rows = await db
    .select({ patient: user })
    .from(careLinks)
    .innerJoin(user, eq(user.id, careLinks.patientId))
    .where(eq(careLinks.caretakerId, caretakerId))
    .orderBy(asc(careLinks.createdAt), asc(careLinks.patientId));
  return rows.map((r) => r.patient);
}

export type UnlinkResult = { ok: true } | { ok: false; reason: "not_found" | "patient_id_required" };

/** A patient removes their (single) link. */
export async function unlinkAsPatient(db: Db, patientId: string): Promise<UnlinkResult> {
  const deleted = await db.delete(careLinks).where(eq(careLinks.patientId, patientId)).returning();
  return deleted.length ? { ok: true } : { ok: false, reason: "not_found" };
}

/**
 * A caretaker removes one of their links. Without `patientId` this only works when
 * they have exactly one patient. The delete is always scoped to caretaker_id, so a
 * caretaker can never unlink someone else's patient.
 */
export async function unlinkAsCaretaker(
  db: Db,
  caretakerId: string,
  patientId: string | undefined,
): Promise<UnlinkResult> {
  let target = patientId;
  if (!target) {
    const links = await db
      .select({ patientId: careLinks.patientId })
      .from(careLinks)
      .where(eq(careLinks.caretakerId, caretakerId))
      .limit(2);
    if (links.length === 0) return { ok: false, reason: "not_found" };
    if (links.length > 1) return { ok: false, reason: "patient_id_required" };
    target = links[0].patientId;
  }
  const deleted = await db
    .delete(careLinks)
    .where(and(eq(careLinks.caretakerId, caretakerId), eq(careLinks.patientId, target)))
    .returning();
  return deleted.length ? { ok: true } : { ok: false, reason: "not_found" };
}

/**
 * Location of one of the caretaker's patients (`patientId`), or of their
 * earliest-linked patient. Always goes through a care_links row for this
 * caretaker, so an unlinked patient id gives null, same as having no link.
 */
export async function findPatientLocation(db: Db, caretakerId: string, patientId?: string) {
  const [row] = await db
    .select({
      latitude: patientLocation.latitude,
      longitude: patientLocation.longitude,
      accuracy: patientLocation.accuracyM,
      recordedAt: patientLocation.recordedAt,
      sharingEnabled: patientLocation.sharingEnabled,
    })
    .from(careLinks)
    .leftJoin(patientLocation, eq(careLinks.patientId, patientLocation.userId))
    .where(
      patientId
        ? and(eq(careLinks.caretakerId, caretakerId), eq(careLinks.patientId, patientId))
        : eq(careLinks.caretakerId, caretakerId),
    )
    .orderBy(asc(careLinks.createdAt), asc(careLinks.patientId))
    .limit(1);
  return row ?? null;
}
