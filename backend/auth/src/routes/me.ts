import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, eq, ne, or } from "drizzle-orm";

import { auth } from "../auth";
import { db } from "../db";
import { careLinks, user, type Role } from "../db/schema";

type UserRow = typeof user.$inferSelect;

const ROLES: Role[] = ["patient", "caretaker"];

/** The JSON shape the app expects for a user. */
function toApi(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    phone_number: u.phoneNumber,
    role: u.role as Role | null,
    created_at: u.createdAt,
  };
}

const fail = (status: 400 | 404 | 409, detail: string) =>
  new HTTPException(status, { res: Response.json({ detail }, { status }) });

async function findUser(where: ReturnType<typeof eq>) {
  const [row] = await db.select().from(user).where(where).limit(1);
  return row ?? null;
}

async function findPartner(userId: string) {
  const [row] = await db
    .select({ partner: user })
    .from(careLinks)
    .innerJoin(user, or(eq(user.id, careLinks.patientId), eq(user.id, careLinks.caretakerId)))
    .where(and(or(eq(careLinks.patientId, userId), eq(careLinks.caretakerId, userId)), ne(user.id, userId)))
    .limit(1);
  return row?.partner ?? null;
}

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "23505";

type Env = { Variables: { user: UserRow } };

/** Routes for the signed-in user. Every route needs a Better Auth session. */
export const me = new Hono<Env>()
  .use(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ detail: "Not signed in" }, 401);
    const row = await findUser(eq(user.id, session.user.id));
    if (!row) return c.json({ detail: "Not signed in" }, 401);
    c.set("user", row);
    await next();
  })

  .get("/", (c) => {
    const me = c.get("user");
    if (!me.role) throw fail(404, "Not registered yet: POST /me with your role");
    return c.json(toApi(me));
  })

  /** First call after signing in: pick patient or caretaker (and optionally a phone number). */
  .post("/", async (c) => {
    const body = await c.req.json<{ role?: string; phone_number?: string | null }>().catch(() => ({}) as never);
    if (!ROLES.includes(body.role as Role)) throw fail(400, "role must be 'patient' or 'caretaker'");
    const me = c.get("user");
    if (me.role) throw fail(409, "Already registered");

    const phone = body.phone_number?.trim() || me.phoneNumber; // keep the phone from Google if none entered
    if (!phone) throw fail(400, "phone_number is required");
    const [row] = await db
      .update(user)
      .set({ role: body.role, phoneNumber: phone })
      .where(eq(user.id, me.id))
      .returning();
    return c.json(toApi(row), 201);
  })

  /** Update your phone number. */
  .patch("/", async (c) => {
    const body = await c.req.json<{ phone_number?: string | null }>().catch(() => ({}) as never);
    const [row] = await db
      .update(user)
      .set({ phoneNumber: body.phone_number?.trim() || null })
      .where(eq(user.id, c.get("user").id))
      .returning();
    return c.json(toApi(row));
  })

  .get("/partner", async (c) => {
    const partner = await findPartner(c.get("user").id);
    if (!partner) throw fail(404, "No linked user");
    return c.json(toApi(partner));
  })

  /** Link yourself to your patient/caretaker by their email. */
  .post("/link", async (c) => {
    const me = c.get("user");
    if (!me.role) throw fail(404, "Register first: POST /me");
    const body = await c.req.json<{ partner_email?: string }>().catch(() => ({}) as never);
    const email = body.partner_email?.trim().toLowerCase();
    if (!email) throw fail(400, "partner_email is required");

    const partner = await findUser(eq(user.email, email));
    if (!partner || !partner.role) throw fail(404, "No user with that email");
    if (partner.role === me.role) throw fail(400, `Both users are ${me.role}s`);

    const [patient, caretaker] = me.role === "patient" ? [me, partner] : [partner, me];
    try {
      const [link] = await db
        .insert(careLinks)
        .values({ patientId: patient.id, caretakerId: caretaker.id })
        .returning();
      return c.json(
        { patient_id: link.patientId, caretaker_id: link.caretakerId, created_at: link.createdAt },
        201,
      );
    } catch (e) {
      if (isUniqueViolation(e)) throw fail(409, "That patient or caretaker is already linked");
      throw e;
    }
  })

  /** Unpair yourself from your patient/caretaker. */
  .delete("/link", async (c) => {
    const id = c.get("user").id;
    const deleted = await db
      .delete(careLinks)
      .where(or(eq(careLinks.patientId, id), eq(careLinks.caretakerId, id)))
      .returning();
    if (deleted.length === 0) throw fail(404, "No link for that user");
    return c.body(null, 204);
  });
