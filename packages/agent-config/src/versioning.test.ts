import { describe, expect, it } from "vitest";
import { rollbackTarget, versionForCall } from "./versioning";

describe("versionForCall", () => {
  it("sends about the chosen share of calls to the candidate, the same way each time", () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `call-${i}`);
    const candidate = ids.filter(
      (id) => versionForCall(id, 3, { version: 4, percent: 20 }).version === 4,
    );
    expect(candidate.length / ids.length).toBeGreaterThan(0.17);
    expect(candidate.length / ids.length).toBeLessThan(0.23);
    expect(versionForCall("call-7", 3, { version: 4, percent: 20 })).toEqual(
      versionForCall("call-7", 3, { version: 4, percent: 20 }),
    );
    expect(versionForCall("x", 3, null)).toEqual({ version: 3, variant: "live" });
    expect(versionForCall("x", 3, { version: 4, percent: 0 }).version).toBe(3);
  });
});

describe("rollbackTarget", () => {
  it("goes back to the version live before the current one", () => {
    const history = [
      { version: 5, kind: "live" as const },
      { version: null, kind: "split-stopped" as const },
      { version: 4, kind: "live" as const },
      { version: 2, kind: "live" as const },
    ];
    expect(rollbackTarget(history, 5)).toBe(4);
    expect(rollbackTarget([{ version: 5, kind: "live" }], 5)).toBeNull();
  });
});
