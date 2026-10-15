import type { Role } from "@voice-agent/db";
import { cookies } from "next/headers";
import {
  decrypt,
  encrypt,
  hashPassword,
  newSessionToken,
  sessionId,
  verifyPassword,
} from "./passwords";
import { getPrisma } from "./store";

// Signing in, sessions and the current business. The proxy (src/proxy.ts) checks the session on
// every request and passes the business on in a request header; server code reads it with
// currentBusinessId().

export const SESSION_COOKIE = "session";
const SESSION_DAYS = 14;

export interface SessionUser {
  userId: string;
  businessId: string;
  name: string;
  email: string;
  role: Role;
}

/** Checks the password and starts a session. Returns the cookie value, or null. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const user = await getPrisma().user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
  const { token, id } = newSessionToken();
  await getPrisma().session.create({
    data: { id, userId: user.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) },
  });
  return token;
}

export async function signOut(token: string): Promise<void> {
  await getPrisma().session.deleteMany({ where: { id: sessionId(token) } });
}

/** The user behind a session cookie, or null (unknown or expired). */
export async function userForToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const session = await getPrisma().session.findUnique({
    where: { id: sessionId(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const { user } = session;
  return {
    userId: user.id,
    businessId: user.businessId,
    name: user.name,
    email: user.email,
    role: user.role,
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

// ----- Per-business vendor keys ----------------------------------------------------------------

function appSecret(): string {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) throw new Error("APP_SECRET must be set (16+ characters).");
  return secret;
}

export async function setBusinessSecret(businessId: string, name: string, value: string | null) {
  const prisma = getPrisma();
  if (value === null) {
    await prisma.businessSecret.deleteMany({ where: { businessId, name } });
    return;
  }
  const sealed = encrypt(value, appSecret());
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
  return row ? { ...process.env, OPENAI_API_KEY: decrypt(row.value, appSecret()) } : process.env;
}
