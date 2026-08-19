import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createUserSession } from "@/server/auth";
import { createProject, getProjectDetail } from "@/server/project-service";
import {
  claimPipelineStep,
  executePipelineRun,
  recoverStalePipelineStep,
} from "@/server/pipeline-service";
import { openDatabase } from "@/server/storage";
import type { GeminiTextAdapter } from "@/server/gemini";
import type { GeminiImageAdapter } from "@/server/gemini-image";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "gradion-pipeline-test-"),
  );
  temporaryDirectories.push(directory);
  const dataDir = path.join(directory, "data");
  const database = openDatabase(dataDir);
  const { user } = createUserSession(database, {
    email: "mira@example.com",
    name: "Mira Hassan",
  });
  const project = createProject(database, {
    bookText: "A river ran beside the burrow.",
    dataDir,
    title: "River Burrow",
    userId: user.id,
  });
  return { dataDir, database, project, user };
}

const detailedPrompt =
  "An adult protagonist with a weathered coat, observant eyes, and a calm presence stands beside the river at dawn. Their clothing, posture, expression, hands, age, face, hair, materials, lighting, environment, and emotional history are described in precise visual detail for a consistent storybook portrait with no text, logos, borders, or decorative lettering.";

function createMockTextAdapter(): GeminiTextAdapter {
  return {
    modelId: "gemini-3.6-flash",
    uploadBook: async () => ({
      mimeType: "text/plain",
      name: "files/book-1",
      uri: "https://generativelanguage.googleapis.com/v1beta/files/book-1",
    }),
    createBookContext: async () => ({
      id: "interaction-book",
      outputText: "context stored",
    }),
    createTextInteraction: async ({ responseFormat }) =>
      responseFormat
        ? {
            id: "interaction-characters",
            outputText: JSON.stringify([
              { age_group: "adult", name: "Mole", prompt: detailedPrompt },
              {
                age_group: "adult",
                name: "Rat",
                prompt: `${detailedPrompt} Their riverside home adds a second visual silhouette.`,
              },
            ]),
          }
        : {
            id: "interaction-style",
            outputText: "Warm painted watercolour.",
          },
  };
}

async function completeTextPipeline(fixture: ReturnType<typeof createFixture>) {
  const styleClaim = claimPipelineStep(fixture.database, {
    projectId: fixture.project.id,
    staleRunMs: 120_000,
    step: "STYLE",
    userId: fixture.user.id,
  });
  fixture.database.close();

  const adapter = createMockTextAdapter();
  await executePipelineRun({
    adapter,
    claim: styleClaim,
    dataDir: fixture.dataDir,
    staleRunMs: 120_000,
  });

  const styleDatabase = openDatabase(fixture.dataDir);
  const charactersClaim = claimPipelineStep(styleDatabase, {
    projectId: fixture.project.id,
    staleRunMs: 120_000,
    step: "CHARACTERS",
    userId: fixture.user.id,
  });
  styleDatabase.close();
  await executePipelineRun({
    adapter,
    claim: charactersClaim,
    dataDir: fixture.dataDir,
    staleRunMs: 120_000,
  });
}

describe("pipeline claims and recovery", () => {
  it("blocks duplicate claims and enforces ordered execution", () => {
    const { database, project, user } = createFixture();

    const claim = claimPipelineStep(database, {
      projectId: project.id,
      staleRunMs: 120_000,
      step: "STYLE",
      userId: user.id,
    });

    expect(() =>
      claimPipelineStep(database, {
        projectId: project.id,
        staleRunMs: 120_000,
        step: "STYLE",
        userId: user.id,
      }),
    ).toThrow(/already running/);

    expect(() =>
      claimPipelineStep(database, {
        projectId: project.id,
        staleRunMs: 120_000,
        step: "CHARACTERS",
        userId: user.id,
      }),
    ).toThrow(/Complete STYLE/);

    database.close();
    expect(claim.runId).toMatch(/[0-9a-f-]{36}/);
  });

  it("opens Portraits only after Characters and keeps later steps locked", () => {
    const { database, project, user } = createFixture();

    expect(() =>
      claimPipelineStep(database, {
        projectId: project.id,
        staleRunMs: 120_000,
        step: "PORTRAITS",
        userId: user.id,
      }),
    ).toThrow(/Complete CHARACTERS/);

    expect(() =>
      claimPipelineStep(database, {
        projectId: project.id,
        staleRunMs: 120_000,
        step: "CHAPTERS",
        userId: user.id,
      }),
    ).toThrow(/not available in this milestone/);

    expect(
      database
        .prepare(
          "SELECT status FROM project_steps WHERE project_id = ? AND step_key = 'PORTRAITS'",
        )
        .get(project.id),
    ).toEqual({ status: "PENDING" });
    database.close();
  });

  it("recovers a stale run without invoking Gemini and allows retry", () => {
    const { database, project, user } = createFixture();
    claimPipelineStep(database, {
      projectId: project.id,
      staleRunMs: 1_000,
      step: "STYLE",
      userId: user.id,
    });
    database
      .prepare(
        "UPDATE project_steps SET heartbeat_at = ? WHERE project_id = ? AND step_key = 'STYLE'",
      )
      .run(new Date(Date.now() - 5_000).toISOString(), project.id);

    recoverStalePipelineStep(database, {
      projectId: project.id,
      staleRunMs: 1_000,
      step: "STYLE",
      userId: user.id,
    });

    expect(
      database
        .prepare(
          "SELECT status, error_code FROM project_steps WHERE project_id = ? AND step_key = 'STYLE'",
        )
        .get(project.id),
    ).toEqual({ status: "FAILED", error_code: "STALE_RUN" });

    expect(
      claimPipelineStep(database, {
        projectId: project.id,
        staleRunMs: 1_000,
        step: "STYLE",
        userId: user.id,
      }).attempt,
    ).toBe(2);
    database.close();
  });
});

describe("mocked text pipeline", () => {
  it("persists one source context, style, and at most two characters", async () => {
    const { database, dataDir, project, user } = createFixture();
    const adapter: GeminiTextAdapter = {
      modelId: "gemini-3.6-flash",
      uploadBook: async () => ({
        mimeType: "text/plain",
        name: "files/book-1",
        uri: "https://generativelanguage.googleapis.com/v1beta/files/book-1",
      }),
      createBookContext: async () => ({
        id: "interaction-book",
        outputText: "context stored",
      }),
      createTextInteraction: async ({ responseFormat }) =>
        responseFormat
          ? {
              id: "interaction-characters",
              outputText: JSON.stringify([
                { age_group: "adult", name: "Mole", prompt: detailedPrompt },
                {
                  age_group: "adult",
                  name: "Rat",
                  prompt: `${detailedPrompt} Their riverside home adds a second visual silhouette.`,
                },
              ]),
            }
          : {
              id: "interaction-style",
              outputText: "Warm painted watercolour.",
            },
    };

    const styleClaim = claimPipelineStep(database, {
      projectId: project.id,
      staleRunMs: 120_000,
      step: "STYLE",
      userId: user.id,
    });
    database.close();

    await executePipelineRun({
      adapter,
      claim: styleClaim,
      dataDir,
      staleRunMs: 120_000,
    });

    const styleDatabase = openDatabase(dataDir);
    const charactersClaim = claimPipelineStep(styleDatabase, {
      projectId: project.id,
      staleRunMs: 120_000,
      step: "CHARACTERS",
      userId: user.id,
    });
    styleDatabase.close();

    await executePipelineRun({
      adapter,
      claim: charactersClaim,
      dataDir,
      staleRunMs: 120_000,
    });

    const finalDatabase = openDatabase(dataDir);
    const detail = getProjectDetail(
      finalDatabase,
      user.id,
      project.id,
      dataDir,
    );
    expect(detail?.style).toBe("Warm painted watercolour.");
    expect(detail?.characters).toHaveLength(2);
    expect(detail?.steps.slice(0, 2).map((step) => step.status)).toEqual([
      "COMPLETED",
      "COMPLETED",
    ]);
    expect(
      finalDatabase
        .prepare(
          "SELECT COUNT(*) AS count FROM gemini_interactions WHERE project_id = ?",
        )
        .get(project.id),
    ).toEqual({ count: 3 });
    finalDatabase.close();
  });
});

describe("mocked portrait pipeline", () => {
  it("persists partial success and retries only the failed portrait", async () => {
    const fixture = createFixture();
    await completeTextPipeline(fixture);

    const database = openDatabase(fixture.dataDir);
    const portraitClaim = claimPipelineStep(database, {
      projectId: fixture.project.id,
      staleRunMs: 120_000,
      step: "PORTRAITS",
      userId: fixture.user.id,
    });
    expect(() =>
      claimPipelineStep(database, {
        projectId: fixture.project.id,
        staleRunMs: 120_000,
        step: "PORTRAITS",
        userId: fixture.user.id,
      }),
    ).toThrow(/already running/);
    database.close();

    const calls: string[] = [];
    const prompts: Array<{
      characterPrompt: string;
      style: string;
    }> = [];
    const imageAdapter: GeminiImageAdapter = {
      modelId: "gemini-3-pro-image-preview",
      generatePortrait: async ({ characterName, characterPrompt, style }) => {
        calls.push(characterName);
        prompts.push({ characterPrompt, style });
        if (characterName === "Rat") {
          throw new Error("Mock image service rejected Rat.");
        }
        return { bytes: Buffer.from("mole-image"), mimeType: "image/png" };
      },
    };
    await executePipelineRun({
      claim: portraitClaim,
      dataDir: fixture.dataDir,
      imageAdapter,
      staleRunMs: 120_000,
    });

    const partialDatabase = openDatabase(fixture.dataDir);
    const partial = getProjectDetail(
      partialDatabase,
      fixture.user.id,
      fixture.project.id,
      fixture.dataDir,
    );
    expect(partial?.steps[2].status).toBe("FAILED");
    expect(
      partial?.characters.map((character) => character.portrait.status),
    ).toEqual(["COMPLETED", "FAILED"]);
    expect(
      partialDatabase
        .prepare(
          "SELECT COUNT(*) AS count FROM assets WHERE project_id = ? AND kind = 'PORTRAIT'",
        )
        .get(fixture.project.id),
    ).toEqual({ count: 1 });
    expect(prompts).toEqual([
      { characterPrompt: detailedPrompt, style: "Warm painted watercolour." },
      {
        characterPrompt: expect.stringContaining("weathered coat"),
        style: "Warm painted watercolour.",
      },
    ]);
    const failedCharacter = partial?.characters[1];
    expect(failedCharacter?.portrait.errorMessage).toContain("rejected Rat");
    partialDatabase.close();

    calls.length = 0;
    const retryDatabase = openDatabase(fixture.dataDir);
    const retryClaim = claimPipelineStep(retryDatabase, {
      portraitCharacterId: failedCharacter?.id,
      projectId: fixture.project.id,
      staleRunMs: 120_000,
      step: "PORTRAITS",
      userId: fixture.user.id,
    });
    retryDatabase.close();

    const retryAdapter: GeminiImageAdapter = {
      ...imageAdapter,
      generatePortrait: async ({ characterName }) => {
        calls.push(characterName);
        return {
          bytes: Buffer.from(`${characterName}-image`),
          mimeType: "image/png",
        };
      },
    };
    await executePipelineRun({
      claim: retryClaim,
      dataDir: fixture.dataDir,
      imageAdapter: retryAdapter,
      portraitCharacterId: failedCharacter?.id,
      staleRunMs: 120_000,
    });

    const finalDatabase = openDatabase(fixture.dataDir);
    const finalProject = getProjectDetail(
      finalDatabase,
      fixture.user.id,
      fixture.project.id,
      fixture.dataDir,
    );
    expect(calls).toEqual(["Rat"]);
    expect(finalProject?.steps[2].status).toBe("COMPLETED");
    expect(
      finalProject?.characters.every(
        (character) => character.portrait.status === "COMPLETED",
      ),
    ).toBe(true);
    expect(
      finalDatabase
        .prepare(
          "SELECT COUNT(*) AS count FROM assets WHERE project_id = ? AND kind = 'PORTRAIT'",
        )
        .get(fixture.project.id),
    ).toEqual({ count: 2 });
    expect(
      finalProject?.characters.map((character) => character.portrait.attempt),
    ).toEqual([1, 2]);
    finalDatabase.close();
  });

  it("recovers a stale portrait run and marks its active items retryable", async () => {
    const fixture = createFixture();
    await completeTextPipeline(fixture);

    const database = openDatabase(fixture.dataDir);
    claimPipelineStep(database, {
      projectId: fixture.project.id,
      staleRunMs: 1_000,
      step: "PORTRAITS",
      userId: fixture.user.id,
    });
    const staleTime = new Date(Date.now() - 5_000).toISOString();
    database
      .prepare(
        "UPDATE project_steps SET heartbeat_at = ? WHERE project_id = ? AND step_key = 'PORTRAITS'",
      )
      .run(staleTime, fixture.project.id);
    database
      .prepare(
        "UPDATE characters SET portrait_heartbeat_at = ? WHERE project_id = ?",
      )
      .run(staleTime, fixture.project.id);

    recoverStalePipelineStep(database, {
      projectId: fixture.project.id,
      staleRunMs: 1_000,
      step: "PORTRAITS",
      userId: fixture.user.id,
    });

    const recovered = getProjectDetail(
      database,
      fixture.user.id,
      fixture.project.id,
      fixture.dataDir,
      1_000,
    );
    expect(recovered?.steps[2].status).toBe("FAILED");
    expect(
      recovered?.characters.every(
        (character) => character.portrait.status === "FAILED",
      ),
    ).toBe(true);
    expect(
      recovered?.characters.every(
        (character) => character.portrait.errorCode === "STALE_RUN",
      ),
    ).toBe(true);
    database.close();
  });

  it("rejects a project that exceeds the two-character portrait cap", async () => {
    const fixture = createFixture();
    await completeTextPipeline(fixture);

    const database = openDatabase(fixture.dataDir);
    const now = new Date().toISOString();
    database
      .prepare(
        `
          INSERT INTO characters
            (id, project_id, position, name, prompt, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        "third-character",
        fixture.project.id,
        2,
        "Badger",
        detailedPrompt,
        now,
        now,
      );

    expect(() =>
      claimPipelineStep(database, {
        projectId: fixture.project.id,
        staleRunMs: 120_000,
        step: "PORTRAITS",
        userId: fixture.user.id,
      }),
    ).toThrow(/at most 2 adult characters/);
    database.close();
  });
});
