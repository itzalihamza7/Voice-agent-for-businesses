import { describe, expect, it } from "vitest";
import { frameAncestors, hostAllowed, normalizeHost, WidgetSettingsSchema } from "./widget";

describe("widget hosts", () => {
  it("normalizes what people type into a host", () => {
    expect(normalizeHost("https://www.SignatureMile.com/en/contact")).toBe("signaturemile.com");
    expect(normalizeHost("shop.signaturemile.com")).toBe("shop.signaturemile.com");
    expect(normalizeHost(" signaturemile.com ")).toBe("signaturemile.com");
    expect(normalizeHost("not a site")).toBeNull();
    expect(normalizeHost("")).toBeNull();
  });

  it("allows a host and its subdomains, nothing else", () => {
    const allowed = ["signaturemile.com"];
    expect(hostAllowed("signaturemile.com", allowed)).toBe(true);
    expect(hostAllowed("www.signaturemile.com", allowed)).toBe(true);
    expect(hostAllowed("evil-signaturemile.com", allowed)).toBe(false);
    expect(hostAllowed("signaturemile.com.evil.io", allowed)).toBe(false);
  });

  it("builds frame-ancestors sources", () => {
    expect(frameAncestors(["example.com"])).toEqual([
      "https://example.com",
      "https://*.example.com",
    ]);
  });

  it("cleans and checks the settings", () => {
    const ok = WidgetSettingsSchema.parse({
      enabled: true,
      allowedHosts: ["https://example.com/x", "example.com", ""],
      color: "#112233",
      title: null,
      dailyCostCapUsd: 2,
    });
    expect(ok.allowedHosts).toEqual(["example.com"]);
    expect(WidgetSettingsSchema.safeParse({ ...ok, allowedHosts: ["not a site"] }).success).toBe(
      false,
    );
  });
});
