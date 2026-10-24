import { getPrisma } from "./store";

// The platform admin's view: every business with its people, agents, calls and AI cost.

export interface BusinessOverview {
  id: string;
  name: string;
  createdAt: string;
  suspended: boolean;
  owner: string | null;
  users: number;
  agents: number;
  calls30d: number;
  aiCost30d: number;
}

export async function businessesOverview(): Promise<BusinessOverview[]> {
  const prisma = getPrisma();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [businesses, calls] = await Promise.all([
    prisma.business.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { users: true, agents: true } },
        users: { where: { role: "owner" }, select: { email: true }, take: 1 },
      },
    }),
    prisma.call.groupBy({
      by: ["businessId"],
      where: { startedAt: { gte: since } },
      _count: { _all: true },
      _sum: { costUsd: true },
    }),
  ]);
  const usage = new Map(calls.map((c) => [c.businessId, c]));
  return businesses.map((b) => ({
    id: b.id,
    name: b.name,
    createdAt: b.createdAt.toISOString(),
    suspended: b.suspendedAt !== null,
    owner: b.users[0]?.email ?? null,
    users: b._count.users,
    agents: b._count.agents,
    calls30d: usage.get(b.id)?._count._all ?? 0,
    aiCost30d: usage.get(b.id)?._sum.costUsd ?? 0,
  }));
}

export async function setSuspended(businessId: string, suspended: boolean): Promise<boolean> {
  const { count } = await getPrisma().business.updateMany({
    where: { id: businessId },
    data: { suspendedAt: suspended ? new Date() : null },
  });
  return count > 0;
}
