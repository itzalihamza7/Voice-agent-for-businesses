import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

// Small crypto helpers with no framework dependencies (unit-tested on their own).

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/** "salt:hash" (hex) with scrypt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = await scryptAsync(password, Buffer.from(salt, "hex"), 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A new session token (for the cookie) and its id (the hash stored in the database). */
export function newSessionToken(): { token: string; id: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, id: sessionId(token) };
}

export function sessionId(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** AES-256-GCM with a key derived from `secret`; the result is base64 of iv + tag + ciphertext. */
export function encrypt(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decrypt(encoded: string, secret: string): string {
  const raw = Buffer.from(encoded, "base64");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

// ----- Envelope encryption: a data key per business -------------------------------------------
// Each business has its own random AES-256 key; only its wrapped form (encrypted with the master
// key) is stored. Values sealed with it are marked "v2:" so older values (sealed directly with
// the master key) can still be told apart and read.

export const SEALED_PREFIX = "v2:";

export function newDataKey(): Buffer {
  return randomBytes(32);
}

export function sealWithKey(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return SEALED_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function openWithKey(sealed: string, key: Buffer): string {
  if (!sealed.startsWith(SEALED_PREFIX)) throw new Error("Not sealed with a data key.");
  const raw = Buffer.from(sealed.slice(SEALED_PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
