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

  it("does not claim a later milestone before it is implemented", () => {
    const { database, project, user } = createFixture();

    expect(() =>
      claimPipelineStep(database, {
        projectId: project.id,
        staleRunMs: 120_000,
        step: "PORTRAITS",
        userId: user.id,
      }),
    ).toThrow(/not available in M2/);

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
