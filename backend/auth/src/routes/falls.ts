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
import { sendFallSms, smsEnabled, toE164 } from "../services/sms";

export const falls = new Hono();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Incident = typeof fallIncidents.$inferSelect;

type Patient = { name: string };

/**
 * Alerts the caretaker by text (Twilio) and, if their phone registered for it, push.
 * The text is the alert that counts: "sent" needs it to go out when it can be sent, since
 * an accepted push ticket doesn't mean the phone got it. Push alone counts only when
 * texting isn't possible. The caller must have claimed the incident (alertStatus
 * "pending"), so this runs once per attempt.
 */
async function deliver(incident: Incident, patient: Patient) {
  try {
    return await tryDeliver(incident, patient);
  } catch (error) {
    // Never leave it "pending": a retry only re-sends a "failed" incident
    console.error(`Fall alert crashed for incident ${incident.id}:`, error);
    await db
      .update(fallIncidents)
      .set({ alertStatus: "failed" })
      .where(eq(fallIncidents.id, incident.id));
    return {
      status: 202 as const,
      body: {
        incidentId: incident.id,
        alertStatus: "failed",
        detail: "Your caregiver's phone could not be reached",
      },
    };
  }
}

async function tryDeliver(incident: Incident, patient: Patient) {
  const [caretaker] = await db
    .select({ phoneNumber: user.phoneNumber })
    .from(user)
    .where(eq(user.id, incident.caretakerId))
    .limit(1);

  const [device] = await db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(eq(pushTokens.userId, incident.caretakerId))
    .orderBy(desc(pushTokens.updatedAt))
    .limit(1);

  const smsTo = toE164(caretaker?.phoneNumber);
  const canText = smsEnabled() && smsTo !== null;

  const [text, push] = await Promise.allSettled([
    canText
      ? sendFallSms({ to: smsTo!, patientName: patient.name, reason: incident.reason })
      : Promise.resolve(null),
    device
      ? sendEmergencyNotification({
          token: device.token,
          incidentId: incident.id,
          patientId: incident.patientId,
          patientName: patient.name,
          reason: incident.reason,
          detectedAt: incident.detectedAt,
        }).then(() => true)
      : Promise.resolve(null),
  ]);

  if (text.status === "fulfilled" && text.value) {
    console.log(`Fall text sent for incident ${incident.id}: ${text.value}`);
  }
  for (const [channel, r] of [["text", text], ["push", push]] as const) {
    if (r.status === "rejected") console.error(`Fall ${channel} failed for incident ${incident.id}:`, r.reason);
  }

  const sent = canText
    ? text.status === "fulfilled"
    : push.status === "fulfilled" && push.value === true;
  const attempted = canText || !!device;

  await db
    .update(fallIncidents)
    .set({ alertStatus: sent ? "sent" : "failed" })
    .where(eq(fallIncidents.id, incident.id));

  if (sent) {
    return { status: 201 as const, body: { incidentId: incident.id, alertStatus: "sent" } };
  }

  let detail = "Your caregiver's phone could not be reached";
  if (!attempted) {
    if (!caretaker?.phoneNumber) detail = "Your caregiver has no phone number in SafeStep";
    else if (!smsTo) detail = "Your caregiver's phone number is missing its country code";
    else detail = "Text alerts aren't set up on the SafeStep server";
  }

  return {
    status: 202 as const,
    body: { incidentId: incident.id, alertStatus: "failed", detail },
  };
}

/**
 * The patient's app calls this when the safety check escalates. Idempotent on
 * clientAlertId: the app retries with the same id, and a retry never creates a second
 * incident or re-sends a push that already went out. A retry of a failed push tries again.
 */
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
      clientAlertId?: string;
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

  if (!UUID.test(body.clientAlertId ?? "")) {
    return c.json({ detail: "clientAlertId must be a UUID" }, 400);
  }
  const clientAlertId = body.clientAlertId!;

  const parsed = new Date(body.detectedAt ?? "");

  if (!Number.isFinite(parsed.getTime())) {
    return c.json({ detail: "Invalid detection timestamp" }, 400);
  }

  // A phone clock running fast must not stop the alert; use the server's time instead.
  const detectedAt = parsed.getTime() > Date.now() ? new Date() : parsed;

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

  const [created] = await db
    .insert(fallIncidents)
    .values({
      clientAlertId,
      patientId,
      caretakerId: link.caretakerId,
      detectedAt,
      reason: body.reason as "timeout" | "help" | "voice_error",
    })
    .onConflictDoNothing({ target: fallIncidents.clientAlertId })
    .returning();

  if (created) {
    const result = await deliver(created, patient);
    return c.json(result.body, result.status);
  }

  // A retry of an alert we already have
  const [existing] = await db
    .select()
    .from(fallIncidents)
    .where(eq(fallIncidents.clientAlertId, clientAlertId))
    .limit(1);

  if (!existing || existing.patientId !== patientId) {
    return c.json({ detail: "clientAlertId belongs to another alert" }, 409);
  }

  if (existing.alertStatus === "failed") {
    // Claim it so two concurrent retries don't both send
    const [claimed] = await db
      .update(fallIncidents)
      .set({ alertStatus: "pending" })
      .where(
        and(
          eq(fallIncidents.id, existing.id),
          eq(fallIncidents.alertStatus, "failed"),
        ),
      )
      .returning();

    if (claimed) {
      const result = await deliver(claimed, patient);
      return c.json(result.body, result.status);
    }
  }

  const [current] = await db
    .select({ alertStatus: fallIncidents.alertStatus })
    .from(fallIncidents)
    .where(eq(fallIncidents.id, existing.id))
    .limit(1);

  // "pending": another request is sending it right now; the app retries and sees the result
  return c.json(
    { incidentId: existing.id, alertStatus: current?.alertStatus ?? existing.alertStatus },
    current?.alertStatus === "sent" || current?.alertStatus === "acknowledged" ? 200 : 202,
  );
});
