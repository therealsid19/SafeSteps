
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../db";
import { user, pushTokens } from "../db/schema";

export const notifications = new Hono();

notifications.post("/register", async (c) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ detail: "Not signed in" }, 401);
  }

  const [currentUser] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  if (currentUser?.role !== "caretaker") {
    return c.json(
      { detail: "Caregiver access required" },
      403,
    );
  }

  const body = await c.req
    .json<{ token?: string; platform?: string }>()
    .catch(() => null);

  const token = body?.token;
  const platform = body?.platform;

  if (
    !token ||
    !/^(Expo(nent)?PushToken)\[[^\]]+\]$/.test(token) ||
    !["ios", "android"].includes(platform ?? "")
  ) {
    return c.json(
      { detail: "Invalid push token or platform" },
      400,
    );
  }

  await db
    .insert(pushTokens)
    .values({
      userId: session.user.id,
      token,
      platform: platform!,
    })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: {
        userId: session.user.id,
        platform: platform!,
        updatedAt: new Date(),
      },
    });

  return c.json({ registered: true });
});
