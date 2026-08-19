import crypto from "node:crypto";
import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import { PIPELINE_STEPS } from "@/domain/pipeline";
import type { GenerationRunStatus, GenerationRunView } from "@/domain/project";
import { normalizeOptionalStyle } from "@/domain/validation";
import { loadServerEnv } from "@/server/env";
import { PipelineStateError } from "@/server/pipeline-errors";

export const PROMPT_VERSION = "book-illustration-v1";

type GenerationRunRow = {
  id: string;
  project_id: string;
  source_snapshot_hash: string;
  style_text: string | null;
  style_revision: string | null;
  prompt_version: string;
  text_model_id: string | null;
  image_model_id: string | null;
  status: GenerationRunStatus;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  active_generation_run_id: string;
  completed_steps: number;
};

function fingerprint(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function currentModels(): {
  imageModelId: string | null;
  textModelId: string | null;
} {
  const env = loadServerEnv();
  return {
    imageModelId: env.geminiImageModel ?? null,
    textModelId: env.geminiTextModel ?? null,
  };
}

function getProjectRunContext(
  database: Database.Database,
  userId: string,
  projectId: string,
): {
  activeGenerationRunId: string | null;
  sourceSnapshotHash: string | null;
} | null {
  const row = database
    .prepare(
      `SELECT active_generation_run_id, source_snapshot_hash
       FROM projects
       WHERE id = ? AND user_id = ?`,
    )
    .get(projectId, userId) as
    | {
        active_generation_run_id: string | null;
        source_snapshot_hash: string | null;
      }
    | undefined;
  return row
    ? {
        activeGenerationRunId: row.active_generation_run_id,
        sourceSnapshotHash: row.source_snapshot_hash,
      }
    : null;
}

function hasRunningStep(
  database: Database.Database,
  generationRunId: string,
): boolean {
  return Boolean(
    database
      .prepare(
        `SELECT 1 FROM project_steps
         WHERE generation_run_id = ? AND status = 'RUNNING'
         LIMIT 1`,
      )
      .get(generationRunId),
  );
}

function toRunView(row: GenerationRunRow): GenerationRunView {
  return {
    id: row.id,
    sourceSnapshotHash: row.source_snapshot_hash,
    style: row.style_text,
    styleRevision: row.style_revision,
    promptVersion: row.prompt_version,
    textModelId: row.text_model_id,
    imageModelId: row.image_model_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    completedSteps: row.completed_steps,
    totalSteps: PIPELINE_STEPS.length,
    isSelected: row.id === row.active_generation_run_id,
    isWritable:
      row.id === row.active_generation_run_id && row.status === "ACTIVE",
  };
}

export function createInitialGenerationRun(
  database: Database.Database,
  input: {
    projectId: string;
    sourceSnapshotHash: string;
    createdAt: string;
  },
): string {
  const runId = randomUUID();
  const models = currentModels();
  database
    .prepare(
      `INSERT INTO generation_runs
        (id, project_id, source_snapshot_hash, prompt_version, text_model_id,
         image_model_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
    )
    .run(
      runId,
      input.projectId,
      input.sourceSnapshotHash,
      PROMPT_VERSION,
      models.textModelId,
      models.imageModelId,
      input.createdAt,
      input.createdAt,
    );
  return runId;
}

export function listGenerationRuns(
  database: Database.Database,
  userId: string,
  projectId: string,
): GenerationRunView[] | null {
  const context = getProjectRunContext(database, userId, projectId);
  if (!context) return null;

  return database
    .prepare(
      `SELECT gr.id, gr.project_id, gr.source_snapshot_hash, gr.style_text,
          gr.style_revision, gr.prompt_version, gr.text_model_id, gr.image_model_id,
          gr.status, gr.created_at, gr.updated_at, gr.completed_at,
          p.active_generation_run_id,
          (SELECT COUNT(*) FROM project_steps ps
            WHERE ps.generation_run_id = gr.id AND ps.status = 'COMPLETED') AS completed_steps
       FROM generation_runs gr
       INNER JOIN projects p ON p.id = gr.project_id
       WHERE gr.project_id = ? AND p.user_id = ?
       ORDER BY gr.created_at DESC, gr.id DESC`,
    )
    .all(projectId, userId)
    .map((row) => toRunView(row as GenerationRunRow));
}

export function createGenerationRun(
  database: Database.Database,
  input: { userId: string; projectId: string; style: unknown },
): GenerationRunView {
  return database.transaction(() => {
    const context = getProjectRunContext(
      database,
      input.userId,
      input.projectId,
    );
    if (
      !context ||
      !context.activeGenerationRunId ||
      !context.sourceSnapshotHash
    ) {
      throw new PipelineStateError("NOT_FOUND", "Project not found.");
    }
    if (hasRunningStep(database, context.activeGenerationRunId)) {
      throw new PipelineStateError(
        "RUN_ALREADY_ACTIVE",
        "Finish or recover the active step before starting another generation run.",
      );
    }

    const style = normalizeOptionalStyle(input.style);
    const runId = randomUUID();
    const now = new Date().toISOString();
    const models = currentModels();
    const previousStatus = database
      .prepare("SELECT status FROM generation_runs WHERE id = ?")
      .get(context.activeGenerationRunId) as
      { status: GenerationRunStatus } | undefined;
    const previousSteps = database
      .prepare(
        "SELECT COUNT(*) AS total, SUM(status = 'COMPLETED') AS completed FROM project_steps WHERE generation_run_id = ?",
      )
      .get(context.activeGenerationRunId) as {
      total: number;
      completed: number | null;
    };
    const previousIsComplete =
      previousSteps.total === PIPELINE_STEPS.length &&
      previousSteps.completed === PIPELINE_STEPS.length;
    if (previousStatus) {
      database
        .prepare(
          "UPDATE generation_runs SET status = ?, updated_at = ? WHERE id = ?",
        )
        .run(
          previousIsComplete ? "COMPLETED" : "SUPERSEDED",
          now,
          context.activeGenerationRunId,
        );
    }

    database
      .prepare(
        `INSERT INTO generation_runs
          (id, project_id, source_snapshot_hash, style_text, style_revision,
           prompt_version, text_model_id, image_model_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      )
      .run(
        runId,
        input.projectId,
        context.sourceSnapshotHash,
        style || null,
        style ? fingerprint(style) : null,
        PROMPT_VERSION,
        models.textModelId,
        models.imageModelId,
        now,
        now,
      );

    const insertStep = database.prepare(
      `INSERT INTO project_steps
        (generation_run_id, project_id, step_key, position, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    PIPELINE_STEPS.forEach((step, position) => {
      insertStep.run(
        runId,
        input.projectId,
        step,
        position,
        step === "STYLE" && style ? "COMPLETED" : "PENDING",
        now,
        now,
      );
    });

    database
      .prepare(
        `UPDATE projects
         SET active_generation_run_id = ?, style_text = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(runId, style || null, now, input.projectId, input.userId);

    const view = listGenerationRuns(
      database,
      input.userId,
      input.projectId,
    )?.find((run) => run.id === runId);
    if (!view)
      throw new Error("Created generation run could not be read back.");
    return view;
  })();
}

export function selectGenerationRun(
  database: Database.Database,
  input: { userId: string; projectId: string; generationRunId: string },
): GenerationRunView {
  return database.transaction(() => {
    const run = database
      .prepare(
        `SELECT gr.id, gr.project_id, gr.source_snapshot_hash, gr.style_text,
            gr.style_revision, gr.prompt_version, gr.text_model_id, gr.image_model_id,
            gr.status, gr.created_at, gr.updated_at, gr.completed_at,
            p.active_generation_run_id,
            (SELECT COUNT(*) FROM project_steps ps
              WHERE ps.generation_run_id = gr.id AND ps.status = 'COMPLETED') AS completed_steps
         FROM generation_runs gr
         INNER JOIN projects p ON p.id = gr.project_id
         WHERE gr.id = ? AND gr.project_id = ? AND p.user_id = ?`,
      )
      .get(input.generationRunId, input.projectId, input.userId) as
      GenerationRunRow | undefined;
    if (!run)
      throw new PipelineStateError("NOT_FOUND", "Generation run not found.");
    if (hasRunningStep(database, run.active_generation_run_id)) {
      throw new PipelineStateError(
        "RUN_ALREADY_ACTIVE",
        "Finish or recover the active step before switching generation runs.",
      );
    }
    database
      .prepare(
        "UPDATE projects SET active_generation_run_id = ?, style_text = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      )
      .run(
        input.generationRunId,
        run.style_text,
        new Date().toISOString(),
        input.projectId,
        input.userId,
      );
    const selected = listGenerationRuns(
      database,
      input.userId,
      input.projectId,
    )?.find((candidate) => candidate.id === input.generationRunId);
    if (!selected)
      throw new Error("Selected generation run could not be read back.");
    return selected;
  })();
}

export function getActiveGenerationRunId(
  database: Database.Database,
  input: { userId: string; projectId: string; requestedRunId?: string },
): string {
  const context = getProjectRunContext(database, input.userId, input.projectId);
  if (!context?.activeGenerationRunId) {
    throw new PipelineStateError("NOT_FOUND", "Generation run not found.");
  }
  if (
    input.requestedRunId &&
    input.requestedRunId !== context.activeGenerationRunId
  ) {
    throw new PipelineStateError(
      "RUN_READ_ONLY",
      "This previous generation run is read-only. Start a new run to generate again.",
    );
  }
  const run = database
    .prepare(
      "SELECT status FROM generation_runs WHERE id = ? AND project_id = ?",
    )
    .get(context.activeGenerationRunId, input.projectId) as
    { status: GenerationRunStatus } | undefined;
  if (!run)
    throw new PipelineStateError("NOT_FOUND", "Generation run not found.");
  if (run.status !== "ACTIVE") {
    throw new PipelineStateError(
      "RUN_READ_ONLY",
      "This generation run is read-only. Start a new run to generate again.",
    );
  }
  return context.activeGenerationRunId;
}
