import type { Prisma } from "@voice-agent/db";
import {
  ConnectionActionSchema,
  type ConnectionInput,
  type ConnectionRequestLog,
  type ConnectionSummary,
} from "@voice-agent/shared";
import { connectionTools, type Tool, verifyDomain } from "@voice-agent/tools";
import { z } from "zod";
import { getPrisma } from "./store";
import { open, seal } from "./vault";

// Connections to a business's own apps, per business. The credential is sealed with the
// business's own data key and never leaves the server; the UI only learns whether one is set.
// Agents may change data through a connection only with the business's consent: the app's own
// key, or a verified domain. Every request is written to the audit log.

const ActionsSchema = z.array(ConnectionActionSchema);

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
    verificationToken: row.verificationToken,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    writesAllowed: writesAllowed(row),
  };
}

/** Consent to change data: the app's own credential, or proof the business owns its domain. */
function writesAllowed(row: Pick<Row, "secret" | "verifiedAt" | "authType">): boolean {
  return (row.authType !== "none" && Boolean(row.secret)) || row.verifiedAt !== null;
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
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  const data = {
    name: input.name,
    slug: input.slug,
    baseUrl,
    authType: input.authType,
    authHeader: input.authType === "header" ? input.authHeader : null,
    actions: input.actions as unknown as Prisma.InputJsonArray,
    ...(input.secret ? { secret: await seal(businessId, input.secret) } : {}),
    ...(input.authType === "none" ? { secret: null } : {}),
  };
  if (id) {
    const existing = await prisma.connection.findFirst({ where: { id, businessId } });
    if (!existing) throw new Error("No such connection.");
    // A verified domain only vouches for the host it was checked on.
    const moved = new URL(existing.baseUrl).hostname !== new URL(baseUrl).hostname;
    return summary(
      await prisma.connection.update({
        where: { id },
        data: { ...data, ...(moved ? { verifiedAt: null } : {}) },
      }),
    );
  }
  return summary(await prisma.connection.create({ data: { ...data, businessId } }));
}

export async function deleteConnection(businessId: string, id: string): Promise<boolean> {
  const { count } = await getPrisma().connection.deleteMany({ where: { id, businessId } });
  return count > 0;
}

/**
 * Checks the connection's verification token on its API's domain (DNS TXT record or
 * /.well-known/vesper-verify.txt) and records the result.
 */
export async function verifyConnection(businessId: string, id: string) {
  const prisma = getPrisma();
  const row = await prisma.connection.findFirst({ where: { id, businessId } });
  if (!row) return null;
  const result = await verifyDomain(row.baseUrl, row.verificationToken, networkOptions());
  if (result.verified) {
    await prisma.connection.update({ where: { id }, data: { verifiedAt: new Date() } });
  }
  return result;
}

/** The latest requests made through a connection (the audit log), newest first. */
export async function connectionRequests(businessId: string, connectionId: string, take = 50) {
  const rows = await getPrisma().connectionRequest.findMany({
    where: { businessId, connectionId },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map((r) => ({
    id: r.id,
    callId: r.callId,
    action: r.action,
    method: r.method,
    path: r.path,
    status: r.status,
    ok: r.ok,
    error: r.error,
    latencyMs: r.latencyMs,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Every action of every connection of the business, as agent tools. `callId` ties the audit
 * log's entries to the call they were made in.
 */
export async function businessConnectionTools(
  businessId: string,
  context: { callId?: string } = {},
): Promise<Tool[]> {
  const prisma = getPrisma();
  const rows = await prisma.connection.findMany({ where: { businessId } });
  return Promise.all(
    rows.map(async (row) => {
      const secret = row.secret ? await open(businessId, row.secret) : null;
      const authHeaders: Record<string, string> =
        row.authType === "bearer" && secret
          ? { authorization: `Bearer ${secret}` }
          : row.authType === "header" && secret && row.authHeader
            ? { [row.authHeader]: secret }
            : {};
      const onRequest = (entry: ConnectionRequestLog) => {
        prisma.connectionRequest
          .create({
            data: {
              businessId,
              connectionId: row.id,
              callId: context.callId ?? null,
              ...entry,
              error: entry.error?.slice(0, 500) ?? null,
            },
          })
          .catch((error: unknown) => console.error("Couldn't write the audit log:", error));
      };
      return connectionTools(
        {
          slug: row.slug,
          name: row.name,
          baseUrl: row.baseUrl,
          authHeaders,
          actions: ActionsSchema.parse(row.actions),
          writesAllowed: writesAllowed(row),
          onRequest,
        },
        networkOptions(),
      );
    }),
  ).then((lists) => lists.flat());
}

export function networkOptions() {
  return { allowPrivateHosts: process.env.TOOLS_ALLOW_PRIVATE_HOSTS === "true" };
}
