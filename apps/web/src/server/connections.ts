import type { Prisma } from "@voice-agent/db";
import {
  ConnectionActionSchema,
  type ConnectionInput,
  type ConnectionSummary,
} from "@voice-agent/shared";
import { connectionTools, type Tool } from "@voice-agent/tools";
import { z } from "zod";
import { decrypt, encrypt } from "./passwords";
import { getPrisma } from "./store";

// Connections to a business's own apps, per business. The credential is encrypted with
// APP_SECRET and never leaves the server; the UI only learns whether one is set.

const ActionsSchema = z.array(ConnectionActionSchema);

function appSecret(): string {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) throw new Error("APP_SECRET must be set (16+ characters).");
  return secret;
}

type Row = Awaited<ReturnType<ReturnType<typeof getPrisma>["connection"]["findFirstOrThrow"]>>;

function summary(row: Row): ConnectionSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    baseUrl: row.baseUrl,
    authType: row.authType as ConnectionSummary["authType"],
    authHeader: row.authHeader,
    actions: ActionsSchema.parse(row.actions),
    hasSecret: Boolean(row.secret),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listConnections(businessId: string): Promise<ConnectionSummary[]> {
  const rows = await getPrisma().connection.findMany({
    where: { businessId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(summary);
}

/** Creates or (with an id) updates a connection. A null secret keeps the stored one. */
export async function saveConnection(
  businessId: string,
  input: ConnectionInput,
  id?: string,
): Promise<ConnectionSummary> {
  const prisma = getPrisma();
  const data = {
    name: input.name,
    slug: input.slug,
    baseUrl: input.baseUrl.replace(/\/+$/, ""),
    authType: input.authType,
    authHeader: input.authType === "header" ? input.authHeader : null,
    actions: input.actions as unknown as Prisma.InputJsonArray,
    ...(input.secret ? { secret: encrypt(input.secret, appSecret()) } : {}),
    ...(input.authType === "none" ? { secret: null } : {}),
  };
  if (id) {
    const existing = await prisma.connection.findFirst({ where: { id, businessId } });
    if (!existing) throw new Error("No such connection.");
    return summary(await prisma.connection.update({ where: { id }, data }));
  }
  return summary(await prisma.connection.create({ data: { ...data, businessId } }));
}

export async function deleteConnection(businessId: string, id: string): Promise<boolean> {
  const { count } = await getPrisma().connection.deleteMany({ where: { id, businessId } });
  return count > 0;
}

/** Every action of every connection of the business, as agent tools. */
export async function businessConnectionTools(businessId: string): Promise<Tool[]> {
  const rows = await getPrisma().connection.findMany({ where: { businessId } });
  return rows.flatMap((row) => {
    const secret = row.secret ? decrypt(row.secret, appSecret()) : null;
    const authHeaders: Record<string, string> =
      row.authType === "bearer" && secret
        ? { authorization: `Bearer ${secret}` }
        : row.authType === "header" && secret && row.authHeader
          ? { [row.authHeader]: secret }
          : {};
    return connectionTools(
      {
        slug: row.slug,
        name: row.name,
        baseUrl: row.baseUrl,
        authHeaders,
        actions: ActionsSchema.parse(row.actions),
      },
      networkOptions(),
    );
  });
}

export function networkOptions() {
  return { allowPrivateHosts: process.env.TOOLS_ALLOW_PRIVATE_HOSTS === "true" };
}
