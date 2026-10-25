import { describe, expect, it } from "vitest";
import { candidateHosts, verifyDomain } from "./verification";

const base = { allowPrivateHosts: false, lookup: async () => ["93.184.216.34"] };
const noFile: typeof fetch = async () => new Response("", { status: 404 });

describe("domain verification", () => {
  it("checks the API's host and its parent domains", () => {
    expect(candidateHosts("https://api.shop.example.com/v1")).toEqual([
      "api.shop.example.com",
      "shop.example.com",
      "example.com",
    ]);
  });

  it("accepts the token in a TXT record of a parent domain", async () => {
    const result = await verifyDomain("https://api.example.com", "tok-1", {
      ...base,
      fetch: noFile,
      resolveTxt: async (host) =>
        host === "example.com" ? [["v=spf1 -all"], ["vesper-verify=", "tok-1"]] : [],
    });
    expect(result).toMatchObject({ verified: true, method: "dns" });
  });

  it("accepts the token in the well-known file", async () => {
    const result = await verifyDomain("https://example.com/api", "tok-2", {
      ...base,
      resolveTxt: async () => [],
      fetch: async (url) =>
        String(url) === "https://example.com/.well-known/vesper-verify.txt"
          ? new Response("tok-2\n")
          : new Response("", { status: 404 }),
    });
    expect(result).toMatchObject({ verified: true, method: "file" });
  });

  it("refuses another business's token and lists what it checked", async () => {
    const result = await verifyDomain("https://example.com", "mine", {
      ...base,
      resolveTxt: async () => [["vesper-verify=someone-else"]],
      fetch: async () => new Response("someone-else"),
    });
    expect(result.verified).toBe(false);
    expect(result.checked).toContain("TXT example.com");
  });
});
