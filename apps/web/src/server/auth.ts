import type { Role } from "@voice-agent/db";
import { cookies } from "next/headers";
import { hashPassword, newSessionToken, sessionId, verifyPassword } from "./passwords";
import { getPrisma } from "./store";
import { open, seal } from "./vault";

// Signing in, sessions and the current business. The proxy (src/proxy.ts) checks the session on
// every request and passes the business on in a request header; server code reads it with
// currentBusinessId().

export const SESSION_COOKIE = "session";
const SESSION_DAYS = 14;

export interface SessionUser {
  userId: string;
  businessId: string;
  businessName: string;
  name: string;
  email: string;
  role: Role;
  isPlatformAdmin: boolean;
  /** The business was suspended by a platform admin: its users are signed out. */
  suspended: boolean;
}

/** Checks the password and starts a session. Returns the cookie value, or null. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const user = await getPrisma().user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
  return startSession(user.id);
}

async function startSession(userId: string): Promise<string> {
  const { token, id } = newSessionToken();
  await getPrisma().session.create({
    data: { id, userId, expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) },
  });
  return token;
}

/** Self sign-up: a new business with the person as its owner, signed in. Null if the email is taken. */
export async function signUp(input: {
  businessName: string;
  name: string;
  email: string;
  password: string;
}): Promise<string | null> {
  const email = input.email.trim().toLowerCase();
  const prisma = getPrisma();
  if (await prisma.user.findUnique({ where: { email } })) return null;
  const user = await prisma.user.create({
    data: {
      email,
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
      role: "owner",
      business: { create: { name: input.businessName.trim() } },
    },
  });
  return startSession(user.id);
}

/** The Set-Cookie value for a session (Secure when the browser used HTTPS, even behind a proxy). */
export function sessionCookie(token: string, request: Request): string {
  const https =
    request.headers.get("x-forwarded-proto") === "https" ||
    new URL(request.url).protocol === "https:";
  const maxAge = SESSION_DAYS * 86400;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https ? "; Secure" : ""}`;
}

export async function signOut(token: string): Promise<void> {
  await getPrisma().session.deleteMany({ where: { id: sessionId(token) } });
}

/** The user behind a session cookie, or null (unknown or expired). */
export async function userForToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const session = await getPrisma().session.findUnique({
    where: { id: sessionId(token) },
    include: { user: { include: { business: { select: { name: true, suspendedAt: true } } } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const { user } = session;
  return {
    userId: user.id,
    businessId: user.businessId,
    businessName: user.business.name,
    name: user.name,
    email: user.email,
    role: user.role,
    isPlatformAdmin: user.isPlatformAdmin,
    suspended: user.business.suspendedAt !== null,
  };
}

/** The signed-in user (server components and route handlers). */
export async function currentUser(): Promise<SessionUser | null> {
  return userForToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function createUser(input: {
  businessId: string;
  email: string;
  name: string;
  password: string;
  role: Role;
}) {
  return getPrisma().user.create({
    data: {
      businessId: input.businessId,
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
      role: input.role,
    },
    select: { id: true, email: true, name: true, role: true },
  });
}

// ----- Per-business vendor keys (sealed with the business's own data key, see vault.ts) ---------

export async function setBusinessSecret(businessId: string, name: string, value: string | null) {
  const prisma = getPrisma();
  if (value === null) {
    await prisma.businessSecret.deleteMany({ where: { businessId, name } });
    return;
  }
  const sealed = await seal(businessId, value);
  await prisma.businessSecret.upsert({
    where: { businessId_name: { businessId, name } },
    create: { businessId, name, value: sealed },
    update: { value: sealed },
  });
}

/** Which secrets a business has set (names only: values never leave the server). */
export async function businessSecretNames(businessId: string): Promise<string[]> {
  const rows = await getPrisma().businessSecret.findMany({
    where: { businessId },
    select: { name: true },
  });
  return rows.map((r) => r.name);
}

/**
 * Environment for creating a business's models: the platform's settings, with the business's
 * own OpenAI key when it has set one.
 */
export async function modelEnv(businessId: string): Promise<Record<string, string | undefined>> {
  const row = await getPrisma().businessSecret.findUnique({
    where: { businessId_name: { businessId, name: "OPENAI_API_KEY" } },
  });
  return row ? { ...process.env, OPENAI_API_KEY: await open(businessId, row.value) } : process.env;
}
