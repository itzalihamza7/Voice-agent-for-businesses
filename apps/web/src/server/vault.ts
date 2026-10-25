import { decrypt, encrypt, newDataKey, openWithKey, SEALED_PREFIX, sealWithKey } from "./passwords";
import { getPrisma } from "./store";

// Business secrets (its OpenAI key, its apps' credentials), encrypted with the business's own
// data key. The data key is stored wrapped with the master key (APP_SECRET), so the database
// alone opens nothing, and rotating one business's key touches no other business.

function masterKey(): string {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) throw new Error("APP_SECRET must be set (16+ characters).");
  return secret;
}

/** The business's data key, created on first use. */
async function dataKey(businessId: string): Promise<Buffer> {
  const prisma = getPrisma();
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { dataKey: true },
  });
  if (business.dataKey) return Buffer.from(decrypt(business.dataKey, masterKey()), "base64");
  const key = newDataKey();
  const wrapped = encrypt(key.toString("base64"), masterKey());
  // Only set it if no other request did in the meantime; then read whichever won.
  await prisma.business.updateMany({
    where: { id: businessId, dataKey: null },
    data: { dataKey: wrapped },
  });
  return dataKey(businessId);
}

export async function seal(businessId: string, plain: string): Promise<string> {
  return sealWithKey(plain, await dataKey(businessId));
}

/** Opens a sealed value; older values sealed with the master key directly still open. */
export async function open(businessId: string, sealed: string): Promise<string> {
  return sealed.startsWith(SEALED_PREFIX)
    ? openWithKey(sealed, await dataKey(businessId))
    : decrypt(sealed, masterKey());
}

/**
 * Replaces the business's data key and re-seals all its secrets with the new one (older values
 * sealed with the master key are moved over too). Returns how many values were re-sealed.
 */
export async function rotateDataKey(businessId: string): Promise<number> {
  const prisma = getPrisma();
  const [secrets, connections] = await Promise.all([
    prisma.businessSecret.findMany({ where: { businessId } }),
    prisma.connection.findMany({
      where: { businessId, secret: { not: null } },
      select: { id: true, secret: true },
    }),
  ]);
  const plainSecrets = await Promise.all(secrets.map(async (s) => open(businessId, s.value)));
  const plainConnections = await Promise.all(
    connections.map(async (c) => open(businessId, c.secret!)),
  );
  const key = newDataKey();
  await prisma.$transaction([
    prisma.business.update({
      where: { id: businessId },
      data: { dataKey: encrypt(key.toString("base64"), masterKey()) },
    }),
    ...secrets.map((s, i) =>
      prisma.businessSecret.update({
        where: { businessId_name: { businessId, name: s.name } },
        data: { value: sealWithKey(plainSecrets[i]!, key) },
      }),
    ),
    ...connections.map((c, i) =>
      prisma.connection.update({
        where: { id: c.id },
        data: { secret: sealWithKey(plainConnections[i]!, key) },
      }),
    ),
  ]);
  return secrets.length + connections.length;
}
