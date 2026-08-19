import { describe, expect, it } from "vitest";

import {
  parseGeneratedChapters,
  parseGeneratedCharacters,
  parseGeneratedStyle,
} from "@/server/gemini-output";

const prompt =
  "An adult character with a thoughtful expression and practical clothing stands in a richly described riverside setting at dawn. Include precise details for their age, face, hair, posture, hands, materials, color palette, light, environment, mood, and story history so the resulting portrait stays consistent across later illustrations without any text, logos, borders, or decorative lettering.";

describe("Gemini structured output validation", () => {
  it("accepts adult character prompts within the hard cap", () => {
    expect(
      parseGeneratedCharacters(
        JSON.stringify([{ age_group: "adult", name: "Mole", prompt }]),
      ),
    ).toEqual([{ ageGroup: "adult", name: "Mole", prompt }]);
  });

  it("rejects malformed, non-adult, and over-limit output", () => {
    expect(() => parseGeneratedCharacters("not-json")).toThrow(
      /invalid character JSON/,
    );
    expect(() =>
      parseGeneratedCharacters(
        JSON.stringify([{ age_group: "child", name: "Mole", prompt }]),
      ),
    ).toThrow(/not marked as an adult/);
    expect(() =>
      parseGeneratedCharacters(
        JSON.stringify([
          { age_group: "adult", name: "A", prompt },
          { age_group: "adult", name: "B", prompt },
          { age_group: "adult", name: "C", prompt },
        ]),
      ),
    ).toThrow(/more than 2/);
  });

  it("requires a non-empty style", () => {
    expect(parseGeneratedStyle("  ink and paper  ")).toBe("ink and paper");
    expect(() => parseGeneratedStyle(" ")).toThrow(/empty art style/);
  });

  it("accepts one chapter and rejects over-limit output", () => {
    expect(
      parseGeneratedChapters(
        JSON.stringify([
          { name: "The River", prompt: "A single river scene." },
        ]),
      ),
    ).toEqual([{ name: "The River", prompt: "A single river scene." }]);
    expect(() =>
      parseGeneratedChapters(
        JSON.stringify([
          { name: "One", prompt: "A scene." },
          { name: "Two", prompt: "Another scene." },
        ]),
      ),
    ).toThrow(/more than 1 chapter/);
  });
});
