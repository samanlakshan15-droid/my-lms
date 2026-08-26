import "server-only";

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "lms_session";
const SESSION_DAYS = 7;

export type SessionRole = "user" | "admin";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;

  const hashedBuffer = Buffer.from(key, "hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;

  if (hashedBuffer.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(hashedBuffer, derived);
}

export async function createSession(role: SessionRole, userId?: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({ token, role, userId: userId ?? null, expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await db.delete(sessions).where(eq(sessions.token, token));
  }

  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!session) {
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  if (session.role === "user" && session.userId) {
    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);

    return {
      token: session.token,
      role: session.role,
      user,
    };
  }

  return {
    token: session.token,
    role: session.role,
    user: null,
  };
}

export async function requireUserSession() {
  const session = await getSession();
  if (!session || session.role !== "user" || !session.user) {
    redirect("/login");
  }
  return session;
}

export async function requireAdminSession() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/admin/login");
  }
  return session;
}

export const requireTeacherSession = requireAdminSession;

export const DEFAULT_TEACHER_USERNAME = "admin";
export const DEFAULT_TEACHER_PASSWORD = "200620061450";
