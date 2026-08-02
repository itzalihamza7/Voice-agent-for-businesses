import { describe, expect, it } from "vitest";
import { renderTemplate } from "./template";

describe("renderTemplate", () => {
  it("fills known variables, with or without spaces inside the braces", () => {
    expect(
      renderTemplate("Hi {{name}}, {{ service }} booked", { name: "Ali", service: "Haircut" }),
    ).toBe("Hi Ali, Haircut booked");
  });

  it("leaves unknown variables visible", () => {
    expect(renderTemplate("Hi {{name}}", {})).toBe("Hi {{name}}");
  });

  it("does not treat values as templates", () => {
    expect(renderTemplate("{{a}}", { a: "{{b}}", b: "x" })).toBe("{{b}}");
  });
});
