import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

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

    expect(
      database
        .prepare(
          "SELECT active_run_id, attempt_count, status FROM project_steps WHERE project_id = ? AND step_key = 'STYLE'",
        )
        .get(project.id),
    ).toEqual({
      active_run_id: claim.runId,
      attempt_count: 1,
      status: "RUNNING",
    });
    expect(
      database
        .prepare(
          "SELECT id, attempt, status FROM pipeline_runs WHERE project_id = ? AND step_key = 'STYLE'",
        )
        .get(project.id),
    ).toEqual({ id: claim.runId, attempt: 1, status: "RUNNING" });

    database.close();
    expect(claim.runId).toMatch(/[0-9a-f-]{36}/);
  });

  it("edits a completed chapter prompt while preserving its current illustration", () => {
    const { dataDir, database, project, user } = createFixture();
    const generationRunId = project.activeGenerationRunId as string;
    const now = new Date().toISOString();
    database
      .prepare(
        "UPDATE project_steps SET status = 'COMPLETED' WHERE project_id = ? AND generation_run_id = ?",
      )
      .run(project.id, generationRunId);
    database
      .prepare(
        "UPDATE generation_runs SET status = 'COMPLETED', completed_at = ? WHERE id = ?",
      )
      .run(now, generationRunId);
    database
      .prepare(
        `INSERT INTO assets
          (id, project_id, generation_run_id, kind, storage_key, mime_type, byte_size, checksum, created_at, updated_at)
         VALUES (?, ?, ?, 'ILLUSTRATION', ?, 'image/png', 4, 'old-checksum', ?, ?)`,
      )
      .run(
        "old-illustration",
        project.id,
        generationRunId,
        "assets/old-illustration.png",
        now,
        now,
      );
    database
      .prepare(
        `INSERT INTO chapters
          (id, project_id, generation_run_id, position, name, prompt,
           illustration_status, illustration_asset_id, created_at, updated_at)
         VALUES (?, ?, ?, 0, 'The River', 'Old prompt', 'COMPLETED', ?, ?, ?)`,
      )
      .run(
        "chapter-1",
        project.id,
        generationRunId,
        "old-illustration",
        now,
        now,
      );

    expect(getProjectDetail(database, user.id, project.id, dataDir)).toEqual(
      expect.objectContaining({
        selectedRunReadOnly: false,
        generationRuns: [
          expect.objectContaining({ isWritable: true, status: "COMPLETED" }),
        ],
      }),
    );

    const claim = claimPipelineStep(database, {
      allowCompletedItemRetry: true,
      editedPrompt: "A revised dawn scene with warmer light.",
      illustrationChapterId: "chapter-1",
      projectId: project.id,
      staleRunMs: 120_000,
      step: "ILLUSTRATIONS",
      userId: user.id,
    });

    expect(
      database
        .prepare(
          "SELECT prompt, illustration_status, illustration_asset_id FROM chapters WHERE id = ?",
        )
        .get("chapter-1"),
    ).toEqual({
      illustration_asset_id: "old-illustration",
      illustration_status: "RUNNING",
      prompt: "A revised dawn scene with warmer light.",
    });
    expect(
      database
        .prepare(
          "SELECT status, completed_at FROM generation_runs WHERE id = ?",
        )
        .get(generationRunId),
    ).toEqual({ completed_at: null, status: "ACTIVE" });
    expect(claim.attempt).toBe(1);
    database.close();
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
    ).toThrow(/Complete PORTRAITS/);
    expect(() =>
      claimPipelineStep(database, {
        projectId: project.id,
        staleRunMs: 120_000,
        step: "ILLUSTRATIONS",
        userId: user.id,
      }),
    ).toThrow(/Complete CHAPTERS/);

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

  it.each([
    { heartbeat: null, label: "missing" },
    { heartbeat: "not-a-timestamp", label: "invalid" },
  ])("treats a $label heartbeat as stale and recoverable", ({ heartbeat }) => {
    const { database, dataDir, project, user } = createFixture();
    const claim = claimPipelineStep(database, {
      projectId: project.id,
      staleRunMs: 1_000,
      step: "STYLE",
      userId: user.id,
    });
    database
      .prepare(
        "UPDATE project_steps SET heartbeat_at = NULL WHERE project_id = ? AND step_key = 'STYLE'",
      )
      .run(project.id);
    if (heartbeat !== null) {
      database
        .prepare(
          "UPDATE project_steps SET heartbeat_at = ? WHERE project_id = ? AND step_key = 'STYLE'",
        )
        .run(heartbeat, project.id);
    }

    expect(
      getProjectDetail(database, user.id, project.id, dataDir, 1_000)?.steps[0]
        .run.isStale,
    ).toBe(true);

    expect(() =>
      claimPipelineStep(database, {
        projectId: project.id,
        staleRunMs: 1_000,
        step: "STYLE",
        userId: user.id,
      }),
    ).toThrow(/stale/);

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
    const retry = claimPipelineStep(database, {
      projectId: project.id,
      staleRunMs: 1_000,
      step: "STYLE",
      userId: user.id,
    });
    expect(retry.runId).not.toBe(claim.runId);
    expect(retry.attempt).toBe(2);
    database.close();
  });

  it("does not invoke Gemini after a stale run has been recovered", async () => {
    const { database, dataDir, project, user } = createFixture();
    const claim = claimPipelineStep(database, {
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
    database.close();

    let geminiCalls = 0;
    const adapter: GeminiTextAdapter = {
      modelId: "gemini-3.6-flash",
      uploadBook: async () => {
        geminiCalls += 1;
        return {
          mimeType: "text/plain",
          name: "files/book-1",
          uri: "https://generativelanguage.googleapis.com/v1beta/files/book-1",
        };
      },
      createBookContext: async () => {
        geminiCalls += 1;
        return { id: "interaction-book", outputText: "context stored" };
      },
      createTextInteraction: async () => {
        geminiCalls += 1;
        return { id: "interaction-style", outputText: "Should not run." };
      },
    };

    await executePipelineRun({
      adapter,
      claim,
      dataDir,
      staleRunMs: 1_000,
    });

    expect(geminiCalls).toBe(0);
  });

  it("keeps a long Gemini call fresh with persisted heartbeats", async () => {
    vi.useFakeTimers();
    try {
      const { database, dataDir, project, user } = createFixture();
      const claim = claimPipelineStep(database, {
        projectId: project.id,
        staleRunMs: 1_000,
        step: "STYLE",
        userId: user.id,
      });
      database.close();

      let resolveStyle!: (value: { id: string; outputText: string }) => void;
      const styleInteraction = new Promise<{
        id: string;
        outputText: string;
      }>((resolve) => {
        resolveStyle = resolve;
      });
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
        createTextInteraction: async () => styleInteraction,
      };

      const execution = executePipelineRun({
        adapter,
        claim,
        dataDir,
        staleRunMs: 1_000,
      });
      await vi.advanceTimersByTimeAsync(400);

      const inFlightDatabase = openDatabase(dataDir);
      const inFlight = getProjectDetail(
        inFlightDatabase,
        user.id,
        project.id,
        dataDir,
        1_000,
      );
      expect(inFlight?.steps[0].run.isStale).toBe(false);
      expect(inFlight?.steps[0].run.heartbeatAt).not.toBe(claim.claimedAt);
      inFlightDatabase.close();

      resolveStyle({
        id: "interaction-style",
        outputText: "Warm painted watercolour.",
      });
      await execution;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("mocked text pipeline", () => {
  it("marks malformed Gemini output failed without persisting partial results", async () => {
    const fixture = createFixture();
    const database = fixture.database;
    const claim = claimPipelineStep(database, {
      projectId: fixture.project.id,
      staleRunMs: 120_000,
      step: "STYLE",
      userId: fixture.user.id,
    });
    database.close();

    let textCalls = 0;
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
      createTextInteraction: async () => {
        textCalls += 1;
        return { id: "interaction-style", outputText: " " };
      },
    };

    await executePipelineRun({
      adapter,
      claim,
      dataDir: fixture.dataDir,
      staleRunMs: 120_000,
    });

    const finalDatabase = openDatabase(fixture.dataDir);
    const project = getProjectDetail(
      finalDatabase,
      fixture.user.id,
      fixture.project.id,
      fixture.dataDir,
    );
    expect(textCalls).toBe(1);
    expect(project?.style).toBeNull();
    expect(project?.characters).toHaveLength(0);
    expect(project?.steps[0].status).toBe("FAILED");
    expect(project?.steps[0].run.errorCode).toBe("GEMINI_INVALID_OUTPUT");
    finalDatabase.close();
  });

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
  it("keeps the previous portrait when an edited-prompt retry fails", async () => {
    const fixture = createFixture();
    await completeTextPipeline(fixture);

    const portraitDatabase = openDatabase(fixture.dataDir);
    const portraitClaim = claimPipelineStep(portraitDatabase, {
      projectId: fixture.project.id,
      staleRunMs: 120_000,
      step: "PORTRAITS",
      userId: fixture.user.id,
    });
    portraitDatabase.close();

    const successAdapter: GeminiImageAdapter = {
      modelId: "gemini-3-pro-image-preview",
      generatePortrait: async ({ characterName }) => ({
        bytes: Buffer.from(`${characterName}-portrait`),
        mimeType: "image/png",
      }),
      generateIllustration: async () => ({
        bytes: Buffer.from("illustration"),
        mimeType: "image/png",
      }),
    };
    await executePipelineRun({
      claim: portraitClaim,
      dataDir: fixture.dataDir,
      imageAdapter: successAdapter,
      staleRunMs: 120_000,
    });

    const retryDatabase = openDatabase(fixture.dataDir);
    const beforeRetry = getProjectDetail(
      retryDatabase,
      fixture.user.id,
      fixture.project.id,
      fixture.dataDir,
    );
    const character = beforeRetry?.characters[0];
    const previousAssetId = character?.portrait.assetId;
    const editedPrompt = `${character?.prompt} Add a bright red scarf.`;
    const retryClaim = claimPipelineStep(retryDatabase, {
      allowCompletedItemRetry: true,
      editedPrompt,
      portraitCharacterId: character?.id,
      projectId: fixture.project.id,
      staleRunMs: 120_000,
      step: "PORTRAITS",
      userId: fixture.user.id,
    });
    const duringRetry = getProjectDetail(
      retryDatabase,
      fixture.user.id,
      fixture.project.id,
      fixture.dataDir,
    );
    expect(duringRetry?.characters[0]).toEqual(
      expect.objectContaining({
        prompt: editedPrompt,
        portrait: expect.objectContaining({
          assetId: previousAssetId,
          status: "RUNNING",
        }),
      }),
    );
    retryDatabase.close();

    let receivedPrompt = "";
    await executePipelineRun({
      claim: retryClaim,
      dataDir: fixture.dataDir,
      imageAdapter: {
        ...successAdapter,
        generatePortrait: async ({ characterPrompt }) => {
          receivedPrompt = characterPrompt;
          throw new Error("Edited portrait retry failed.");
        },
      },
      portraitCharacterId: character?.id,
      staleRunMs: 120_000,
    });

    const failedDatabase = openDatabase(fixture.dataDir);
    const afterFailure = getProjectDetail(
      failedDatabase,
      fixture.user.id,
      fixture.project.id,
      fixture.dataDir,
    );
    expect(receivedPrompt).toBe(editedPrompt);
    expect(afterFailure?.characters[0]).toEqual(
      expect.objectContaining({
        prompt: editedPrompt,
        portrait: expect.objectContaining({
          assetId: previousAssetId,
          status: "FAILED",
        }),
      }),
    );
    expect(afterFailure?.attemptHistory[0]).toEqual(
      expect.objectContaining({ status: "FAILED", step: "PORTRAITS" }),
    );
    failedDatabase.close();
  });

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
      generateIllustration: async () => ({
        bytes: Buffer.from("illustration-image"),
        mimeType: "image/png",
      }),
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
      generateIllustration: async () => ({
        bytes: Buffer.from("illustration-image"),
        mimeType: "image/png",
      }),
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
            (id, project_id, generation_run_id, position, name, prompt, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        "third-character",
        fixture.project.id,
        fixture.project.activeGenerationRunId,
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

describe("mocked chapter and illustration pipeline", () => {
  it("enforces the one-chapter cap before illustration execution", () => {
    const fixture = createFixture();
    const database = fixture.database;
    const now = new Date().toISOString();
    database
      .prepare(
        "UPDATE project_steps SET status = 'COMPLETED' WHERE project_id = ? AND step_key IN ('STYLE', 'CHARACTERS', 'PORTRAITS', 'CHAPTERS')",
      )
      .run(fixture.project.id);
    const insertChapter = database.prepare(
      `
        INSERT INTO chapters
          (id, project_id, generation_run_id, position, name, prompt, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );
    insertChapter.run(
      "chapter-one",
      fixture.project.id,
      fixture.project.activeGenerationRunId,
      0,
      "One",
      "A scene.",
      now,
      now,
    );
    insertChapter.run(
      "chapter-two",
      fixture.project.id,
      fixture.project.activeGenerationRunId,
      1,
      "Two",
      "Another scene.",
      now,
      now,
    );

    expect(() =>
      claimPipelineStep(database, {
        projectId: fixture.project.id,
        staleRunMs: 120_000,
        step: "ILLUSTRATIONS",
        userId: fixture.user.id,
      }),
    ).toThrow(/at most 1 chapter/);
    database.close();
  });

  it("persists one chapter, passes portrait references, and completes illustrations", async () => {
    const fixture = createFixture();
    await completeTextPipeline(fixture);

    const portraitDatabase = openDatabase(fixture.dataDir);
    const portraitClaim = claimPipelineStep(portraitDatabase, {
      projectId: fixture.project.id,
      staleRunMs: 120_000,
      step: "PORTRAITS",
      userId: fixture.user.id,
    });
    portraitDatabase.close();

    const imageAdapter: GeminiImageAdapter = {
      modelId: "gemini-3-pro-image-preview",
      generatePortrait: async ({ characterName }) => ({
        bytes: Buffer.from(`${characterName}-portrait`),
        mimeType: "image/png",
      }),
      generateIllustration: async () => ({
        bytes: Buffer.from("chapter-illustration"),
        mimeType: "image/png",
      }),
    };
    await executePipelineRun({
      claim: portraitClaim,
      dataDir: fixture.dataDir,
      imageAdapter,
      staleRunMs: 120_000,
    });

    const afterPortraitsDatabase = openDatabase(fixture.dataDir);
    const afterPortraits = getProjectDetail(
      afterPortraitsDatabase,
      fixture.user.id,
      fixture.project.id,
      fixture.dataDir,
    );
    const portraitAssetIds = afterPortraits?.characters.map(
      (character) => character.portrait.assetId,
    );
    const chapterClaim = claimPipelineStep(afterPortraitsDatabase, {
      projectId: fixture.project.id,
      staleRunMs: 120_000,
      step: "CHAPTERS",
      userId: fixture.user.id,
    });
    afterPortraitsDatabase.close();

    const chapterPrompts: string[] = [];
    const chapterAdapter: GeminiTextAdapter = {
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
      createTextInteraction: async ({ prompt }) => {
        chapterPrompts.push(prompt);
        return {
          id: "interaction-chapters",
          outputText: JSON.stringify([
            {
              name: "The River",
              prompt:
                "Mole and Rat meet beside the river at dawn in the saved warm painted watercolour style.",
            },
          ]),
        };
      },
    };
    await executePipelineRun({
      adapter: chapterAdapter,
      claim: chapterClaim,
      dataDir: fixture.dataDir,
      staleRunMs: 120_000,
    });

    expect(chapterPrompts[0]).toContain("Mole");
    expect(chapterPrompts[0]).toContain("Rat");
    expect(chapterPrompts[0]).toContain("Warm painted watercolour.");
    expect(chapterPrompts[0]).toContain("Persisted portrait references");
    portraitAssetIds?.forEach((assetId) => {
      expect(chapterPrompts[0]).toContain(`portrait asset ${assetId}`);
    });

    const illustrationDatabase = openDatabase(fixture.dataDir);
    const illustrationClaim = claimPipelineStep(illustrationDatabase, {
      projectId: fixture.project.id,
      staleRunMs: 120_000,
      step: "ILLUSTRATIONS",
      userId: fixture.user.id,
    });
    illustrationDatabase.close();

    let illustrationInput:
      Parameters<GeminiImageAdapter["generateIllustration"]>[0] | undefined;
    const illustrationAdapter: GeminiImageAdapter = {
      ...imageAdapter,
      generateIllustration: async (input) => {
        illustrationInput = input;
        return {
          bytes: Buffer.from("final-illustration"),
          mimeType: "image/png",
        };
      },
    };
    await executePipelineRun({
      claim: illustrationClaim,
      dataDir: fixture.dataDir,
      imageAdapter: illustrationAdapter,
      staleRunMs: 120_000,
    });

    const finalDatabase = openDatabase(fixture.dataDir);
    const finalProject = getProjectDetail(
      finalDatabase,
      fixture.user.id,
      fixture.project.id,
      fixture.dataDir,
    );
    expect(finalProject?.status).toBe("DONE");
    expect(finalProject?.chapters).toHaveLength(1);
    expect(finalProject?.chapters[0].illustration.status).toBe("COMPLETED");
    expect(finalProject?.chapters[0].illustration.assetId).toBeTruthy();
    expect(illustrationInput?.chapterName).toBe("The River");
    expect(illustrationInput?.style).toBe("Warm painted watercolour.");
    expect(
      illustrationInput?.portraitReferences.map((ref) => ref.assetId),
    ).toEqual(portraitAssetIds);
    expect(
      finalDatabase
        .prepare(
          "SELECT kind FROM assets WHERE project_id = ? ORDER BY kind ASC",
        )
        .all(fixture.project.id),
    ).toEqual([
      { kind: "ILLUSTRATION" },
      { kind: "PORTRAIT" },
      { kind: "PORTRAIT" },
    ]);
    finalDatabase.close();

    const restartedDatabase = openDatabase(fixture.dataDir);
    const afterRestart = getProjectDetail(
      restartedDatabase,
      fixture.user.id,
      fixture.project.id,
      fixture.dataDir,
    );
    expect(afterRestart).toEqual(
      expect.objectContaining({
        bookText: "A river ran beside the burrow.",
        style: "Warm painted watercolour.",
        status: "DONE",
      }),
    );
    expect(afterRestart?.characters).toHaveLength(2);
    expect(
      afterRestart?.characters.every(
        (character) => character.portrait.assetUrl,
      ),
    ).toBe(true);
    expect(afterRestart?.chapters[0].prompt).toContain("Mole and Rat");
    expect(afterRestart?.chapters[0].illustration.assetUrl).toBe(
      `/api/assets/${afterRestart?.chapters[0].illustration.assetId}`,
    );
    restartedDatabase.close();
  });

  it("retries chapters and illustrations without losing upstream results", async () => {
    const fixture = createFixture();
    await completeTextPipeline(fixture);

    const portraitDatabase = openDatabase(fixture.dataDir);
    const portraitClaim = claimPipelineStep(portraitDatabase, {
      projectId: fixture.project.id,
      staleRunMs: 120_000,
      step: "PORTRAITS",
      userId: fixture.user.id,
    });
    portraitDatabase.close();

    const imageAdapter: GeminiImageAdapter = {
      modelId: "gemini-3-pro-image-preview",
      generatePortrait: async ({ characterName }) => ({
        bytes: Buffer.from(`${characterName}-portrait`),
        mimeType: "image/png",
      }),
      generateIllustration: async () => ({
        bytes: Buffer.from("illustration-image"),
        mimeType: "image/png",
      }),
    };
    await executePipelineRun({
      claim: portraitClaim,
      dataDir: fixture.dataDir,
      imageAdapter,
      staleRunMs: 120_000,
    });

    const afterPortraitsDatabase = openDatabase(fixture.dataDir);
    const afterPortraits = getProjectDetail(
      afterPortraitsDatabase,
      fixture.user.id,
      fixture.project.id,
      fixture.dataDir,
    );
    const portraitAssetIds = afterPortraits?.characters.map(
      (character) => character.portrait.assetId,
    );
    const chapterClaim = claimPipelineStep(afterPortraitsDatabase, {
      projectId: fixture.project.id,
      staleRunMs: 120_000,
      step: "CHAPTERS",
      userId: fixture.user.id,
    });
    afterPortraitsDatabase.close();

    const chapterAdapter = (outputText: string): GeminiTextAdapter => ({
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
      createTextInteraction: async () => ({
        id: `interaction-chapters-${outputText.length}`,
        outputText,
      }),
    });

    await executePipelineRun({
      adapter: chapterAdapter(" "),
      claim: chapterClaim,
      dataDir: fixture.dataDir,
      staleRunMs: 120_000,
    });

    const afterChapterFailureDatabase = openDatabase(fixture.dataDir);
    const afterChapterFailure = getProjectDetail(
      afterChapterFailureDatabase,
      fixture.user.id,
      fixture.project.id,
      fixture.dataDir,
    );
    expect(afterChapterFailure?.steps[3].status).toBe("FAILED");
    expect(afterChapterFailure?.chapters).toHaveLength(0);
    expect(afterChapterFailure?.style).toBe("Warm painted watercolour.");
    expect(
      afterChapterFailure?.characters.map(
        (character) => character.portrait.assetId,
      ),
    ).toEqual(portraitAssetIds);

    const chapterRetry = claimPipelineStep(afterChapterFailureDatabase, {
      projectId: fixture.project.id,
      staleRunMs: 120_000,
      step: "CHAPTERS",
      userId: fixture.user.id,
    });
    afterChapterFailureDatabase.close();

    const chapterPrompt = "Mole and Rat meet beside the river at dawn.";
    await executePipelineRun({
      adapter: chapterAdapter(
        JSON.stringify([{ name: "The River", prompt: chapterPrompt }]),
      ),
      claim: chapterRetry,
      dataDir: fixture.dataDir,
      staleRunMs: 120_000,
    });

    const afterChapterDatabase = openDatabase(fixture.dataDir);
    const illustrationClaim = claimPipelineStep(afterChapterDatabase, {
      projectId: fixture.project.id,
      staleRunMs: 120_000,
      step: "ILLUSTRATIONS",
      userId: fixture.user.id,
    });
    afterChapterDatabase.close();

    await executePipelineRun({
      claim: illustrationClaim,
      dataDir: fixture.dataDir,
      imageAdapter: {
        ...imageAdapter,
        generateIllustration: async () => {
          throw new Error("Mock illustration service timed out.");
        },
      },
      staleRunMs: 120_000,
    });

    const afterIllustrationFailureDatabase = openDatabase(fixture.dataDir);
    const afterIllustrationFailure = getProjectDetail(
      afterIllustrationFailureDatabase,
      fixture.user.id,
      fixture.project.id,
      fixture.dataDir,
    );
    expect(afterIllustrationFailure?.steps[4].status).toBe("FAILED");
    expect(afterIllustrationFailure?.chapters[0].prompt).toBe(chapterPrompt);
    expect(
      afterIllustrationFailure?.characters.map(
        (character) => character.portrait.assetId,
      ),
    ).toEqual(portraitAssetIds);

    const illustrationRetry = claimPipelineStep(
      afterIllustrationFailureDatabase,
      {
        projectId: fixture.project.id,
        staleRunMs: 120_000,
        step: "ILLUSTRATIONS",
        userId: fixture.user.id,
      },
    );
    afterIllustrationFailureDatabase.close();

    await executePipelineRun({
      claim: illustrationRetry,
      dataDir: fixture.dataDir,
      imageAdapter,
      staleRunMs: 120_000,
    });

    const finalDatabase = openDatabase(fixture.dataDir);
    const finalProject = getProjectDetail(
      finalDatabase,
      fixture.user.id,
      fixture.project.id,
      fixture.dataDir,
    );
    expect(finalProject?.status).toBe("DONE");
    expect(finalProject?.style).toBe("Warm painted watercolour.");
    expect(finalProject?.chapters[0].prompt).toBe(chapterPrompt);
    expect(finalProject?.chapters[0].illustration.status).toBe("COMPLETED");
    expect(finalProject?.chapters[0].illustration.attempt).toBe(2);
    expect(
      finalProject?.characters.map((character) => character.portrait.assetId),
    ).toEqual(portraitAssetIds);
    finalDatabase.close();
  });

  it("recovers a stale illustration run without invoking the image adapter", async () => {
    const fixture = createFixture();
    const database = openDatabase(fixture.dataDir);
    const now = new Date().toISOString();
    database
      .prepare(
        "UPDATE project_steps SET status = 'COMPLETED' WHERE project_id = ? AND step_key IN ('STYLE', 'CHARACTERS', 'PORTRAITS', 'CHAPTERS')",
      )
      .run(fixture.project.id);
    database
      .prepare(
        `
          INSERT INTO chapters
            (id, project_id, generation_run_id, position, name, prompt, created_at, updated_at)
          VALUES (?, ?, ?, 0, ?, ?, ?, ?)
        `,
      )
      .run(
        "chapter-stale",
        fixture.project.id,
        fixture.project.activeGenerationRunId,
        "The Interrupted River",
        "A saved chapter prompt.",
        now,
        now,
      );
    const claim = claimPipelineStep(database, {
      projectId: fixture.project.id,
      staleRunMs: 1_000,
      step: "ILLUSTRATIONS",
      userId: fixture.user.id,
    });
    const staleTime = new Date(Date.now() - 5_000).toISOString();
    database
      .prepare(
        "UPDATE project_steps SET heartbeat_at = ? WHERE project_id = ? AND step_key = 'ILLUSTRATIONS'",
      )
      .run(staleTime, fixture.project.id);
    database
      .prepare(
        "UPDATE chapters SET illustration_heartbeat_at = ? WHERE project_id = ?",
      )
      .run(staleTime, fixture.project.id);

    recoverStalePipelineStep(database, {
      projectId: fixture.project.id,
      staleRunMs: 1_000,
      step: "ILLUSTRATIONS",
      userId: fixture.user.id,
    });

    const recovered = getProjectDetail(
      database,
      fixture.user.id,
      fixture.project.id,
      fixture.dataDir,
      1_000,
    );
    expect(recovered?.steps[4].status).toBe("FAILED");
    expect(recovered?.steps[4].run.errorCode).toBe("STALE_RUN");
    expect(recovered?.chapters[0].illustration.status).toBe("FAILED");
    expect(recovered?.chapters[0].illustration.errorCode).toBe("STALE_RUN");
    expect(claim.runId).toMatch(/[0-9a-f-]{36}/);
    database.close();
  });
});
