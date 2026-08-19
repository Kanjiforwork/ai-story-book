import { describe, expect, it } from "vitest";

import {
  assertPipelineCaps,
  PIPELINE_LIMITS,
  PIPELINE_STEPS,
} from "@/domain/pipeline";

describe("pipeline contract", () => {
  it("keeps the five steps in the required order", () => {
    expect(PIPELINE_STEPS).toEqual([
      "STYLE",
      "CHARACTERS",
      "PORTRAITS",
      "CHAPTERS",
      "ILLUSTRATIONS",
    ]);
  });

  it("enforces the adult-character and chapter caps", () => {
    expect(PIPELINE_LIMITS).toEqual({ adultCharacters: 2, chapters: 1 });
    expect(() =>
      assertPipelineCaps({ adultCharacterCount: 2, chapterCount: 1 }),
    ).not.toThrow();
    expect(() =>
      assertPipelineCaps({ adultCharacterCount: 3, chapterCount: 1 }),
    ).toThrow(/at most 2 adult characters/);
    expect(() =>
      assertPipelineCaps({ adultCharacterCount: 2, chapterCount: 2 }),
    ).toThrow(/at most 1 chapter/);
  });
});
