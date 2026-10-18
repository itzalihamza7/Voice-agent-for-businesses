import { describe, expect, it } from "vitest";
import { hit, limitFor } from "./rate-limit";

describe("rate limits", () => {
  it("allows up to the limit per window, then says how long to wait", () => {
    const limit = { requests: 2, windowMs: 10_000 };
    expect(hit("u1:ai", limit, 0)).toBeNull();
    expect(hit("u1:ai", limit, 1000)).toBeNull();
    expect(hit("u1:ai", limit, 2000)).toBe(8);
    expect(hit("u2:ai", limit, 2000)).toBeNull();
    expect(hit("u1:ai", limit, 10_000)).toBeNull();
  });

  it("limits AI work and sign-in attempts, not reads", () => {
    expect(limitFor("/api/test-calls/abc", "POST")).toBe("ai");
    expect(limitFor("/api/agents/demo/evals/runs/r1/cases/c1", "POST")).toBe("ai");
    expect(limitFor("/api/auth/login", "POST")).toBe("login");
    expect(limitFor("/api/agents", "GET")).toBeNull();
    expect(limitFor("/api/agents", "POST")).toBeNull();
  });
});
