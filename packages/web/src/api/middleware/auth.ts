import { createMiddleware } from "hono/factory";
import { auth } from "../auth";
import { db } from "../database";
import { session as sessionTable, user as userTable } from "../database/auth-schema";
import { eq, and, gt } from "drizzle-orm";

export const authMiddleware = createMiddleware(async (c, next) => {
  // 1. Try better-auth cookie-based session first
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session?.user) {
    c.set("user", session.user);
    c.set("session", session.session);
    return next();
  }

  // 2. Fall back to raw Bearer token (for sessions created via /api/register)
  const authHeader = c.req.header("Authorization") ?? "";
  const rawToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (rawToken) {
    const now = new Date();
    const [row] = await db
      .select({ session: sessionTable, user: userTable })
      .from(sessionTable)
      .innerJoin(userTable, eq(sessionTable.userId, userTable.id))
      .where(and(eq(sessionTable.token, rawToken), gt(sessionTable.expiresAt, now)));

    if (row) {
      c.set("user", row.user as any);
      c.set("session", row.session as any);
      return next();
    }
  }

  c.set("user", null);
  c.set("session", null);
  return next();
});

export const requireAuth = createMiddleware(async (c, next) => {
  if (!c.get("user")) return c.json({ message: "Unauthorized" }, 401);
  return next();
});
