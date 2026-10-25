import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encrypt } from "./passwords";
import { getPrisma } from "./store";
import { open, rotateDataKey, seal } from "./vault";

// Integration test against the real PostgreSQL in DDEV (`ddev npm run test:db`).
// Each test uses its own throwaway business.

const businessIds: string[] = [];

beforeAll(() => {
  process.env.APP_SECRET ??= "test-master-secret-for-vault";
});
afterAll(async () => {
  await getPrisma().business.deleteMany({ where: { id: { in: businessIds } } });
});

async function newBusiness() {
  const id = `test-${crypto.randomUUID()}`;
  businessIds.push(id);
  await getPrisma().business.create({ data: { id, name: "Test business" } });
  return id;
}

describe("vault", () => {
  it("seals with the business's own key, which another business can't open", async () => {
    const [a, b] = [await newBusiness(), await newBusiness()];
    const sealed = await seal(a, "sk-a-123");
    expect(sealed.startsWith("v2:")).toBe(true);
    expect(await open(a, sealed)).toBe("sk-a-123");
    await seal(b, "anything"); // gives b its own key
    await expect(open(b, sealed)).rejects.toThrow();
  });

  it("still opens older values and moves them to the business key when rotating", async () => {
    const id = await newBusiness();
    const prisma = getPrisma();
    const legacy = encrypt("sk-old-456", process.env.APP_SECRET!);
    await prisma.businessSecret.create({
      data: { businessId: id, name: "OPENAI_API_KEY", value: legacy },
    });
    expect(await open(id, legacy)).toBe("sk-old-456");

    const before = await seal(id, "kept");
    expect(await rotateDataKey(id)).toBe(1);
    const row = await prisma.businessSecret.findUniqueOrThrow({
      where: { businessId_name: { businessId: id, name: "OPENAI_API_KEY" } },
    });
    expect(row.value.startsWith("v2:")).toBe(true);
    expect(await open(id, row.value)).toBe("sk-old-456");
    // Values sealed with the old key don't open any more.
    await expect(open(id, before)).rejects.toThrow();
  });
});
