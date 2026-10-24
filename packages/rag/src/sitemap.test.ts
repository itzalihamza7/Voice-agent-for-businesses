import { describe, expect, it } from "vitest";
import { pickLanguage } from "./sitemap";

describe("pickLanguage", () => {
  const urls = [
    "https://s.example/en",
    "https://s.example/es",
    "https://s.example/en/fleet",
    "https://s.example/es/flota",
    "https://s.example/en/airport-transfers",
  ];

  it("keeps the language the business typed, else English", () => {
    expect(pickLanguage(urls, "/es")).toEqual([
      "https://s.example/es",
      "https://s.example/es/flota",
    ]);
    expect(pickLanguage(urls, "/")).toEqual([
      "https://s.example/en",
      "https://s.example/en/fleet",
      "https://s.example/en/airport-transfers",
    ]);
  });

  it("keeps every page on sites without language prefixes", () => {
    const plain = ["https://p.example/", "https://p.example/prices", "https://p.example/contact"];
    expect(pickLanguage(plain)).toEqual(plain);
  });
});
