import { describe, expect, it } from "vitest";
import {
  decrypt,
  encrypt,
  hashPassword,
  newDataKey,
  newSessionToken,
  openWithKey,
  sealWithKey,
  sessionId,
  verifyPassword,
} from "./passwords";

describe("passwords, sessions and secrets", () => {
  it("hashes and verifies passwords", async () => {
    const stored = await hashPassword("correct horse");
    expect(stored).not.toContain("correct horse");
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
  });

  it("stores only a hash of the session token", () => {
    const { token, id } = newSessionToken();
    expect(id).toBe(sessionId(token));
    expect(id).not.toBe(token);
  });

  it("encrypts secrets so only the same app secret can read them", () => {
    const sealed = encrypt("sk-test-123", "app secret");
    expect(sealed).not.toContain("sk-test");
    expect(decrypt(sealed, "app secret")).toBe("sk-test-123");
    expect(() => decrypt(sealed, "another secret")).toThrow();
  });

  it("seals with a business's data key, which no other key opens", () => {
    const mine = newDataKey();
    const sealed = sealWithKey("api-key-123", mine);
    expect(sealed.startsWith("v2:")).toBe(true);
    expect(sealed).not.toContain("api-key");
    expect(openWithKey(sealed, mine)).toBe("api-key-123");
    expect(() => openWithKey(sealed, newDataKey())).toThrow();
    expect(() => openWithKey(encrypt("old", "app secret"), mine)).toThrow();
  });
});
