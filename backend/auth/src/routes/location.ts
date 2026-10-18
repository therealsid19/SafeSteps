
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";

import { auth } from "../auth";
import { db } from "../db";
import { findPatientLocation } from "../db/care-links";
import { patientLocation, user } from "../db/schema";

type UserRow = typeof user.$inferSelect;
type Env = { Variables: { user: UserRow } };

export const location = new Hono<Env>()
  .use(async (c, next) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ detail: "Not signed in" }, 401);
    }

    const [currentUser] = await db
      .select()
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    if (!currentUser) {
      return c.json({ detail: "Not signed in" }, 401);
    }

    c.set("user", currentUser);
    await next();
  })

  // Enable or disable location sharing
  .put("/sharing", async (c) => {
    const currentUser = c.get("user");

    if (currentUser.role !== "patient") {
      return c.json({ detail: "Patients only" }, 403);
    }

    const body = await c.req.json().catch(() => null);

    if (
      !body ||
      typeof body.enabled !== "boolean"
    ) {
      return c.json(
        { detail: "enabled must be a boolean" },
        400
      );
    }

    const enabled = body.enabled;

    await db
      .insert(patientLocation)
      .values({
        userId: currentUser.id,
        sharingEnabled: enabled,
      })
      .onConflictDoUpdate({
        target: patientLocation.userId,
        set: {
          sharingEnabled: enabled,
          ...(enabled
            ? {}
            : {
                latitude: null,
                longitude: null,
                accuracyM: null,
                recordedAt: null,
              }),
          updatedAt: new Date(),
        },
      });

    return c.json({ sharing_enabled: enabled });
  })

  // Save the patient's current location
  .put("/me", async (c) => {
    const currentUser = c.get("user");

    if (currentUser.role !== "patient") {
      return c.json({ detail: "Patients only" }, 403);
    }

    const body = await c.req.json().catch(() => null);

    if (
      !body ||
      typeof body.latitude !== "number" ||
      !Number.isFinite(body.latitude) ||
      body.latitude < -90 ||
      body.latitude > 90 ||
      typeof body.longitude !== "number" ||
      !Number.isFinite(body.longitude) ||
      body.longitude < -180 ||
      body.longitude > 180 ||
      (body.accuracy !== undefined &&
        body.accuracy !== null &&
        (typeof body.accuracy !== "number" ||
          !Number.isFinite(body.accuracy) ||
          body.accuracy < 0))
    ) {
      return c.json(
        { detail: "Invalid location coordinates" },
        400
      );
    }

    const [existing] = await db
      .select()
      .from(patientLocation)
      .where(eq(patientLocation.userId, currentUser.id))
      .limit(1);

    if (!existing?.sharingEnabled) {
      return c.json(
        { detail: "Location sharing is disabled" },
        403
      );
    }

    const [saved] = await db
      .update(patientLocation)
      .set({
        latitude: body.latitude,
        longitude: body.longitude,
        accuracyM: body.accuracy ?? null,
        recordedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(patientLocation.userId, currentUser.id),
          eq(patientLocation.sharingEnabled, true)
        )
      )
      .returning();

    if (!saved) {
      return c.json(
        { detail: "Location sharing is disabled" },
        403
      );
    }

    return c.json({
      latitude: saved.latitude,
      longitude: saved.longitude,
      accuracy: saved.accuracyM,
      recorded_at: saved.recordedAt,
    });
  })

  // Get a linked patient's latest location: ?patient_id=, or the earliest-linked
  // patient when it's left out. An unlinked patient_id looks the same as no link.
  .get("/partner", async (c) => {
    const currentUser = c.get("user");

    if (currentUser.role !== "caretaker") {
      return c.json({ detail: "Caretakers only" }, 403);
    }

    const result = await findPatientLocation(
      db,
      currentUser.id,
      c.req.query("patient_id")?.trim() || undefined
    );

    if (!result || !result.sharingEnabled) {
      return c.json({
        sharing_enabled: false,
        location: null,
      });
    }

    if (
      result.latitude === null ||
      result.longitude === null ||
      result.recordedAt === null
    ) {
      return c.json({
        sharing_enabled: true,
        location: null,
      });
    }

    return c.json({
      sharing_enabled: true,
      location: {
        latitude: result.latitude,
        longitude: result.longitude,
        accuracy: result.accuracy,
        recorded_at: result.recordedAt,
      },
    });
  })

  // Clear the patient's saved coordinates
  .delete("/me", async (c) => {
    const currentUser = c.get("user");

    if (currentUser.role !== "patient") {
      return c.json({ detail: "Patients only" }, 403);
    }

    await db
      .update(patientLocation)
      .set({
        latitude: null,
        longitude: null,
        accuracyM: null,
        recordedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(patientLocation.userId, currentUser.id));

    return c.body(null, 204);
  });
