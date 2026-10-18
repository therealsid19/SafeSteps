
import { Hono } from "hono";
import { and, eq, desc } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../db";
import {
  user,
  careLinks,
  pushTokens,
  fallIncidents,
} from "../db/schema";
import { sendEmergencyNotification } from "../services/pushNotifications";

export const falls = new Hono();

falls.post("/escalate", async (c) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ detail: "Not signed in" }, 401);
  }

  const patientId = session.user.id;

  const [patient] = await db
    .select({
      name: user.name,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, patientId))
    .limit(1);

  if (patient?.role !== "patient") {
    return c.json({ detail: "Patient access required" }, 403);
  }

  const body = await c.req
    .json<{
      reason?: string;
      detectedAt?: string;
    }>()
    .catch(() => null);

  if (
    !body ||
    !["timeout", "help", "voice_error"].includes(body.reason ?? "")
  ) {
    return c.json({ detail: "Invalid fall reason" }, 400);
  }

  const detectedAt = new Date(body.detectedAt ?? "");

  if (
    !Number.isFinite(detectedAt.getTime()) ||
    detectedAt.getTime() > Date.now() + 60_000
  ) {
    return c.json({ detail: "Invalid detection timestamp" }, 400);
  }

  const [link] = await db
    .select({ caretakerId: careLinks.caretakerId })
    .from(careLinks)
    .where(eq(careLinks.patientId, patientId))
    .limit(1);

  if (!link) {
    return c.json(
      { detail: "No caregiver linked to this patient" },
      409,
    );
  }

  const [incident] = await db
    .insert(fallIncidents)
    .values({
      patientId,
      caretakerId: link.caretakerId,
      detectedAt,
      reason: body.reason as "timeout" | "help" | "voice_error",
    })
    .returning({ id: fallIncidents.id });

  const [device] = await db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(eq(pushTokens.userId, link.caretakerId))
    .orderBy(desc(pushTokens.updatedAt))
    .limit(1);

  if (!device) {
    await db
      .update(fallIncidents)
      .set({ alertStatus: "failed" })
      .where(eq(fallIncidents.id, incident.id));

    return c.json(
      {
        incidentId: incident.id,
        alertStatus: "failed",
        detail: "Caregiver has not registered for push notifications",
      },
      202,
    );
  }

  try {
    await sendEmergencyNotification({
      token: device.token,
      incidentId: incident.id,
      patientId,
      patientName: patient.name,
      detectedAt,
    });

    await db
      .update(fallIncidents)
      .set({ alertStatus: "sent" })
      .where(eq(fallIncidents.id, incident.id));

    return c.json({
      incidentId: incident.id,
      alertStatus: "sent",
    }, 201);
  } catch (error) {
    console.error("Emergency push failed:", error);

    await db
      .update(fallIncidents)
      .set({ alertStatus: "failed" })
      .where(eq(fallIncidents.id, incident.id));

    return c.json(
      {
        incidentId: incident.id,
        alertStatus: "failed",
        detail: "Incident saved, but notification could not be sent",
      },
      202,
    );
  }
});


