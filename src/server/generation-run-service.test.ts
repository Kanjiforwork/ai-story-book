import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createUserSession } from "@/server/auth";
import {
  createGenerationRun,
  listGenerationRuns,
  selectGenerationRun,
} from "@/server/generation-run-service";
import type { GeminiTextAdapter } from "@/server/gemini";
import {
  claimPipelineStep,
  executePipelineRun,
} from "@/server/pipeline-service";
import { createProject, getProjectDetail } from "@/server/project-service";
import { writeImageAsset } from "@/server/asset-service";
import { openDatabase } from "@/server/storage";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const detailedPrompt =
  "An adult protagonist with a weathered coat, observant eyes, and a calm presence stands beside the river at dawn. Their clothing, posture, expression, hands, age, face, hair, materials, lighting, environment, and emotional history are described in precise visual detail for a consistent storybook portrait with no text, logos, borders, or decorative lettering.";

function fixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "gradion-generation-run-test-"),
  );
  temporaryDirectories.push(directory);
  const dataDir = path.join(directory, "data");
  const database = openDatabase(dataDir);
  const { user } = createUserSession(database, {
    email: "mira-" + directory.slice(-6) + "@example.com",
    name: "Mira Hassan",
  });
  const project = createProject(database, {
    bookText: "A river ran beside the burrow.",
    dataDir,
    title: "River Burrow",
    userId: user.id,
  });
  return {
    dataDir,
    database,
    project,
    runId: project.activeGenerationRunId as string,
    user,
  };
}

function textAdapter(calls: {
  contexts: number;
  interactions: number;
  uploads: number;
}): GeminiTextAdapter {
  let interactionNumber = 0;
  return {
    modelId: "gemini-test-text",
    uploadBook: async () => {
      calls.uploads += 1;
      return {
        mimeType: "text/plain",
        name: "files/book-" + calls.uploads,
        uri: "https://example.test/files/book-" + calls.uploads,
      };
    },
    createBookContext: async () => {
      calls.contexts += 1;
      interactionNumber += 1;
      return {
        id: "context-" + interactionNumber,
        outputText: "source context",
      };
    },
    createTextInteraction: async ({ responseFormat }) => {
      calls.interactions += 1;
      interactionNumber += 1;
      if (responseFormat) {
        const schema = JSON.stringify(responseFormat);
        if (schema.includes("age_group")) {
          return {
            id: "characters-" + interactionNumber,
            outputText: JSON.stringify([
              { age_group: "adult", name: "Mole", prompt: detailedPrompt },
            ]),
          };
        }
        return {
          id: "chapters-" + interactionNumber,
          outputText: JSON.stringify([
            {
              name: "The River",
              prompt: "Mole waits beside the river at dawn.",
            },
          ]),
        };
      }
      return {
        id: "style-" + interactionNumber,
        outputText: "Warm painted watercolour.",
      };
    },
  };
}

async function runStep(
  fixtureValue: ReturnType<typeof fixture>,
  step: Parameters<typeof claimPipelineStep>[1]["step"],
  adapter: GeminiTextAdapter,
  options: { generationRunId?: string; style?: string } = {},
) {
  const database = openDatabase(fixtureValue.dataDir);
  const claim = claimPipelineStep(database, {
    generationRunId: options.generationRunId ?? fixtureValue.runId,
    projectId: fixtureValue.project.id,
    staleRunMs: 120_000,
    step,
    userId: fixtureValue.user.id,
  });
  database.close();
  await executePipelineRun({
    adapter,
    claim,
    dataDir: fixtureValue.dataDir,
    requestedStyle: options.style,
    staleRunMs: 120_000,
  });
}

describe("generation runs", () => {
  it("saves a direct style exactly and makes zero Style Gemini calls", async () => {
    const value = fixture();
    const calls = { contexts: 0, interactions: 0, uploads: 0 };
    const adapter = textAdapter(calls);
    const styleClaim = claimPipelineStep(value.database, {
      generationRunId: value.runId,
      projectId: value.project.id,
      staleRunMs: 120_000,
      step: "STYLE",
      userId: value.user.id,
    });
    value.database.close();

    await executePipelineRun({
      adapter,
      claim: styleClaim,
      dataDir: value.dataDir,
      requestedStyle: "anime",
      staleRunMs: 120_000,
    });

    const database = openDatabase(value.dataDir);
    const project = getProjectDetail(
      database,
      value.user.id,
      value.project.id,
      value.dataDir,
    );
    expect(project?.style).toBe("anime");
    expect(project?.steps[0].status).toBe("COMPLETED");
    expect(calls).toEqual({ contexts: 0, interactions: 0, uploads: 0 });
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM gemini_interactions WHERE generation_run_id = ?",
        )
        .get(value.runId),
    ).toEqual({ count: 0 });
    database.close();
  });

  it("uploads one source per project and reuses it through Style, Characters, and Chapters", async () => {
    const value = fixture();
    const calls = { contexts: 0, interactions: 0, uploads: 0 };
    const adapter = textAdapter(calls);

    await runStep(value, "STYLE", adapter);
    await runStep(value, "CHARACTERS", adapter);

    const database = openDatabase(value.dataDir);
    const character = database
      .prepare(
        "SELECT id FROM characters WHERE generation_run_id = ? ORDER BY position LIMIT 1",
      )
      .get(value.runId) as { id: string };
    const asset = writeImageAsset(value.dataDir, {
      bytes: Buffer.from("portrait"),
      mimeType: "image/png",
    });
    const now = new Date().toISOString();
    database
      .prepare(
        "INSERT INTO assets (id, project_id, generation_run_id, kind, storage_key, mime_type, byte_size, checksum, created_at, updated_at) VALUES (?, ?, ?, 'PORTRAIT', ?, ?, ?, ?, ?, ?)",
      )
      .run(
        asset.id,
        value.project.id,
        value.runId,
        asset.storageKey,
        asset.mimeType,
        asset.byteSize,
        asset.checksum,
        now,
        now,
      );
    database
      .prepare(
        "UPDATE characters SET portrait_status = 'COMPLETED', portrait_asset_id = ? WHERE id = ? AND generation_run_id = ?",
      )
      .run(asset.id, character.id, value.runId);
    database
      .prepare(
        "UPDATE project_steps SET status = 'COMPLETED' WHERE generation_run_id = ? AND step_key = 'PORTRAITS'",
      )
      .run(value.runId);
    database.close();

    await runStep(value, "CHAPTERS", adapter);

    expect(calls.uploads).toBe(1);
    expect(calls.contexts).toBe(1);
    expect(calls.interactions).toBe(3);
  });

  it("creates isolated runs with fresh roots, preserves old output, and selects history without model calls", async () => {
    const value = fixture();
    const calls = { contexts: 0, interactions: 0, uploads: 0 };
    const adapter = textAdapter(calls);

    await runStep(value, "STYLE", adapter, { style: "anime" });
    await runStep(value, "CHARACTERS", adapter);
    const oldRunId = value.runId;
    const oldDatabase = openDatabase(value.dataDir);
    const oldCharacter = getProjectDetail(
      oldDatabase,
      value.user.id,
      value.project.id,
      value.dataDir,
    )?.characters[0];
    oldDatabase.close();

    const newDatabase = openDatabase(value.dataDir);
    const newRun = createGenerationRun(newDatabase, {
      projectId: value.project.id,
      style: "watercolor",
      userId: value.user.id,
    });
    newDatabase.close();
    const newRunId = newRun.id;
    await runStep(value, "CHARACTERS", adapter, { generationRunId: newRunId });

    const selectedNew = openDatabase(value.dataDir);
    const newProject = getProjectDetail(
      selectedNew,
      value.user.id,
      value.project.id,
      value.dataDir,
    );
    const oldCharacters = selectedNew
      .prepare(
        "SELECT COUNT(*) AS count FROM characters WHERE generation_run_id = ?",
      )
      .get(oldRunId);
    const newCharacters = selectedNew
      .prepare(
        "SELECT COUNT(*) AS count FROM characters WHERE generation_run_id = ?",
      )
      .get(newRunId);
    const roots = selectedNew
      .prepare(
        "SELECT generation_run_id, interaction_id FROM gemini_interactions WHERE step_key = 'SOURCE' ORDER BY created_at ASC",
      )
      .all();
    expect(oldCharacter?.name).toBe("Mole");
    expect(oldCharacters).toEqual({ count: 1 });
    expect(newCharacters).toEqual({ count: 1 });
    expect(newProject?.style).toBe("watercolor");
    expect(roots).toHaveLength(2);
    expect((roots[0] as { interaction_id: string }).interaction_id).not.toBe(
      (roots[1] as { interaction_id: string }).interaction_id,
    );
    selectedNew.close();

    const beforeSelect = { ...calls };
    const selectedOldDatabase = openDatabase(value.dataDir);
    const selectedOld = selectGenerationRun(selectedOldDatabase, {
      generationRunId: oldRunId,
      projectId: value.project.id,
      userId: value.user.id,
    });
    expect(selectedOld.id).toBe(oldRunId);
    expect({ ...calls }).toEqual(beforeSelect);

    const oldView = getProjectDetail(
      selectedOldDatabase,
      value.user.id,
      value.project.id,
      value.dataDir,
    );
    expect(oldView?.style).toBe("anime");
    expect(oldView?.selectedRunReadOnly).toBe(true);
    expect(
      listGenerationRuns(selectedOldDatabase, value.user.id, value.project.id),
    ).toHaveLength(2);
    expect(() =>
      claimPipelineStep(selectedOldDatabase, {
        generationRunId: oldRunId,
        projectId: value.project.id,
        staleRunMs: 120_000,
        step: "PORTRAITS",
        userId: value.user.id,
      }),
    ).toThrow(/read-only/);
    selectedOldDatabase.close();
  });

  it("does not share source or generated state between projects", async () => {
    const first = fixture();
    const second = fixture();
    const calls = vi.fn().mockImplementation(async () => ({
      id: "style-" + calls.mock.calls.length,
      outputText: "A distinct style.",
    }));
    const adapter: GeminiTextAdapter = {
      ...textAdapter({ contexts: 0, interactions: 0, uploads: 0 }),
      uploadBook: vi.fn(async () => ({
        mimeType: "text/plain",
        name: "file",
        uri: "https://example.test/" + calls.mock.calls.length,
      })),
      createTextInteraction: calls,
    };

    await runStep(first, "STYLE", adapter);
    await runStep(second, "STYLE", adapter);

    expect(adapter.uploadBook).toHaveBeenCalledTimes(2);
    const firstDatabase = openDatabase(first.dataDir);
    const secondDatabase = openDatabase(second.dataDir);
    const firstProject = getProjectDetail(
      firstDatabase,
      first.user.id,
      first.project.id,
      first.dataDir,
    );
    const secondProject = getProjectDetail(
      secondDatabase,
      second.user.id,
      second.project.id,
      second.dataDir,
    );
    expect(firstProject?.style).toBe("A distinct style.");
    expect(secondProject?.style).toBe("A distinct style.");
    expect(firstProject?.activeGenerationRunId).not.toBe(
      secondProject?.activeGenerationRunId,
    );
    firstDatabase.close();
    secondDatabase.close();
  });
});
