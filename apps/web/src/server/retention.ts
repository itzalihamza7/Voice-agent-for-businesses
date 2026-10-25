import { getPrisma } from "./store";

// Data retention: a business can choose how long call data is kept. Older calls (with their
// transcript, trace and LangGraph thread), caller memories not updated since, and connection
// audit entries are deleted. Runs after calls are recorded (at most hourly per business) and
// when the setting changes.

const HOUR_MS = 3_600_000;
const lastRun = new Map<string, number>();

export const RETENTION_CHOICES = [7, 30, 90, 365] as const;

export interface RetentionResult {
  calls: number;
  callerMemories: number;
  connectionRequests: number;
}

export async function applyRetention(
  businessId: string,
  { force = false }: { force?: boolean } = {},
): Promise<RetentionResult | null> {
  const now = Date.now();
  if (!force && now - (lastRun.get(businessId) ?? 0) < HOUR_MS) return null;
  lastRun.set(businessId, now);

  const prisma = getPrisma();
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { retentionDays: true },
  });
  if (!business?.retentionDays) return { calls: 0, callerMemories: 0, connectionRequests: 0 };
  const cutoff = new Date(now - business.retentionDays * 24 * HOUR_MS);

  const old = await prisma.call.findMany({
    where: { businessId, startedAt: { lt: cutoff } },
    select: { id: true, threadId: true },
  });
  const threads = old.map((c) => c.threadId).filter((t): t is string => t !== null);
  const [calls, callerMemories, connectionRequests] = await prisma.$transaction([
    prisma.call.deleteMany({ where: { id: { in: old.map((c) => c.id) } } }),
    prisma.callerMemory.deleteMany({ where: { businessId, updatedAt: { lt: cutoff } } }),
    prisma.connectionRequest.deleteMany({ where: { businessId, createdAt: { lt: cutoff } } }),
  ]);
  if (threads.length) await deleteThreads(threads);
  return {
    calls: calls.count,
    callerMemories: callerMemories.count,
    connectionRequests: connectionRequests.count,
  };
}

/** The calls' LangGraph checkpoints (they hold the whole conversation state). */
async function deleteThreads(threadIds: string[]) {
  const prisma = getPrisma();
  try {
    for (const table of ["checkpoint_writes", "checkpoint_blobs", "checkpoints"]) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM langgraph.${table} WHERE thread_id = ANY($1::text[])`,
        threadIds,
      );
    }
  } catch (error) {
    // The checkpoint schema is created on first use; nothing to delete without it.
    console.warn(`Couldn't delete call threads: ${String(error)}`);
  }
}
