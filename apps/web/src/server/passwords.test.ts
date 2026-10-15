import { describe, expect, it } from "vitest";
import {
  decrypt,
  encrypt,
  hashPassword,
  newSessionToken,
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
});
