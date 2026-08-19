import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import {
  assertPipelineCaps,
  isImplementedPipelineStep,
  previousPipelineStep,
  type PipelineErrorCode,
  type PipelineStep,
} from "@/domain/pipeline";
import { normalizeOptionalStyle } from "@/domain/validation";
import { loadServerEnv } from "@/server/env";
import {
  CHARACTER_RESPONSE_FORMAT,
  GeminiOutputError,
  parseGeneratedCharacters,
  parseGeneratedStyle,
} from "@/server/gemini-output";
import {
  createGeminiTextAdapter,
  type GeminiTextAdapter,
} from "@/server/gemini";
import {
  createGeminiImageAdapter,
  type GeminiImageAdapter,
} from "@/server/gemini-image";
import { resolveBookPath } from "@/server/book-text";
import {
  removeImageAsset,
  writeImageAsset,
  type StoredImageAsset,
} from "@/server/asset-service";
import { openDatabase } from "@/server/storage";

type PipelineStateCode =
  | PipelineErrorCode
  | "ASSET_WRITE_FAILED"
  | "NOT_FOUND"
  | "PORTRAIT_PARTIAL_FAILURE";

export class PipelineStateError extends Error {
  constructor(
    public readonly code: PipelineStateCode,
    message: string,
  ) {
    super(message);
    this.name = "PipelineStateError";
  }
}

export type StepClaim = {
  attempt: number;
  claimedAt: string;
  projectId: string;
  runId: string;
  step: PipelineStep;
};

type StepExecutionRow = {
  active_run_id: string | null;
  attempt_count: number;
  book_text_key: string;
  gemini_context_interaction_id: string | null;
  gemini_file_name: string | null;
  gemini_file_uri: string | null;
  position: number;
  status: string;
};

type PortraitSelectionRow = {
  id: string;
  portrait_active_run_id: string | null;
  portrait_status: "PENDING" | "RUNNING" | "FAILED" | "COMPLETED";
};

function getStepRow(
  database: Database.Database,
  userId: string,
  projectId: string,
  step: PipelineStep,
): StepExecutionRow | undefined {
  return database
    .prepare(
      `
        SELECT
          ps.active_run_id,
          ps.attempt_count,
          ps.position,
          ps.status,
          p.book_text_key,
          p.gemini_file_name,
          p.gemini_file_uri,
          p.gemini_context_interaction_id
        FROM project_steps ps
        INNER JOIN projects p ON p.id = ps.project_id
        WHERE ps.project_id = ? AND ps.step_key = ? AND p.user_id = ?
      `,
    )
    .get(projectId, step, userId) as StepExecutionRow | undefined;
}

function assertFreshRun(
  row: StepExecutionRow,
  heartbeatAt: string | null,
  staleRunMs: number,
): void {
  if (row.status !== "RUNNING") return;
  const heartbeat = heartbeatAt ? Date.parse(heartbeatAt) : Number.NaN;
  if (Number.isFinite(heartbeat) && Date.now() - heartbeat > staleRunMs) {
    throw new PipelineStateError(
      "STALE_RUN",
      "This step has gone stale. Recover it before retrying.",
    );
  }
  throw new PipelineStateError(
    "RUN_ALREADY_ACTIVE",
    "This step is already running in another request.",
  );
}

function selectPortraitItems(
  database: Database.Database,
  projectId: string,
  characterId?: string,
): PortraitSelectionRow[] {
  const rows = database
    .prepare(
      `
        SELECT id, portrait_active_run_id, portrait_status
        FROM characters
        WHERE project_id = ?
        ORDER BY position ASC
      `,
    )
    .all(projectId) as PortraitSelectionRow[];

  try {
    assertPipelineCaps({ adultCharacterCount: rows.length, chapterCount: 0 });
  } catch (error) {
    throw new PipelineStateError(
      "GEMINI_INVALID_OUTPUT",
      error instanceof Error
        ? error.message
        : "The project exceeds the portrait character limit.",
    );
  }
  if (rows.length === 0) {
    throw new PipelineStateError(
      "STEP_ORDER",
      "Complete Characters before generating portraits.",
    );
  }

  const selected = characterId
    ? rows.filter((row) => row.id === characterId)
    : rows.filter((row) => row.portrait_status !== "COMPLETED");
  if (characterId && selected.length === 0) {
    throw new PipelineStateError("NOT_FOUND", "Character not found.");
  }
  if (selected.some((row) => row.portrait_status === "COMPLETED")) {
    throw new PipelineStateError(
      "STEP_ALREADY_COMPLETED",
      "This portrait is already complete.",
    );
  }
  if (selected.some((row) => row.portrait_status === "RUNNING")) {
    throw new PipelineStateError(
      "RUN_ALREADY_ACTIVE",
      "This portrait is already running in another request.",
    );
  }
  if (selected.length === 0) {
    throw new PipelineStateError(
      "STEP_ALREADY_COMPLETED",
      "All portraits are already complete.",
    );
  }
  return selected;
}

export function claimPipelineStep(
  database: Database.Database,
  input: {
    projectId: string;
    step: PipelineStep;
    userId: string;
    staleRunMs: number;
    portraitCharacterId?: string;
  },
): StepClaim {
  return database.transaction(() => {
    if (!isImplementedPipelineStep(input.step)) {
      throw new PipelineStateError(
        "STEP_NOT_AVAILABLE",
        "This pipeline step is not available in this milestone.",
      );
    }

    const row = getStepRow(database, input.userId, input.projectId, input.step);
    if (!row) {
      throw new PipelineStateError("NOT_FOUND", "Project step not found.");
    }

    if (row.status === "COMPLETED") {
      throw new PipelineStateError(
        "STEP_ALREADY_COMPLETED",
        "This step is already complete.",
      );
    }

    if (row.status === "RUNNING") {
      const heartbeat = database
        .prepare(
          "SELECT heartbeat_at FROM project_steps WHERE project_id = ? AND step_key = ?",
        )
        .get(input.projectId, input.step) as
        { heartbeat_at: string | null } | undefined;
      assertFreshRun(row, heartbeat?.heartbeat_at ?? null, input.staleRunMs);
    }

    const previousStep = previousPipelineStep(input.step);
    if (previousStep) {
      const previous = database
        .prepare(
          "SELECT status FROM project_steps WHERE project_id = ? AND step_key = ?",
        )
        .get(input.projectId, previousStep) as { status: string } | undefined;
      if (previous?.status !== "COMPLETED") {
        throw new PipelineStateError(
          "STEP_ORDER",
          `Complete ${previousStep} before running ${input.step}.`,
        );
      }
    }

    const portraitItems =
      input.step === "PORTRAITS"
        ? selectPortraitItems(
            database,
            input.projectId,
            input.portraitCharacterId,
          )
        : [];

    const now = new Date().toISOString();
    const runId = randomUUID();
    const attempt = row.attempt_count + 1;

    database
      .prepare(
        `
          INSERT INTO pipeline_runs
            (id, project_id, step_key, attempt, status, claimed_at, heartbeat_at)
          VALUES (?, ?, ?, ?, 'RUNNING', ?, ?)
        `,
      )
      .run(runId, input.projectId, input.step, attempt, now, now);
    database
      .prepare(
        `
          UPDATE project_steps
          SET status = 'RUNNING',
              active_run_id = ?,
              attempt_count = ?,
              claimed_at = ?,
              heartbeat_at = ?,
              error_code = NULL,
              error_message = NULL,
              updated_at = ?
          WHERE project_id = ? AND step_key = ?
        `,
      )
      .run(runId, attempt, now, now, now, input.projectId, input.step);

    if (input.step === "PORTRAITS") {
      const updatePortrait = database.prepare(
        `
          UPDATE characters
          SET portrait_status = 'RUNNING',
              portrait_active_run_id = ?,
              portrait_attempt_count = portrait_attempt_count + 1,
              portrait_claimed_at = ?,
              portrait_heartbeat_at = ?,
              portrait_error_code = NULL,
              portrait_error_message = NULL,
              updated_at = ?
          WHERE project_id = ? AND id = ?
        `,
      );
      portraitItems.forEach((item) => {
        updatePortrait.run(runId, now, now, now, input.projectId, item.id);
      });
    }

    return {
      attempt,
      claimedAt: now,
      projectId: input.projectId,
      runId,
      step: input.step,
    };
  })();
}

export function recoverStalePipelineStep(
  database: Database.Database,
  input: {
    projectId: string;
    step: PipelineStep;
    userId: string;
    staleRunMs: number;
  },
): void {
  database.transaction(() => {
    if (!isImplementedPipelineStep(input.step)) {
      throw new PipelineStateError(
        "STEP_NOT_AVAILABLE",
        "This pipeline step is not available in this milestone.",
      );
    }

    const row = getStepRow(database, input.userId, input.projectId, input.step);
    if (!row) {
      throw new PipelineStateError("NOT_FOUND", "Project step not found.");
    }
    if (row.status !== "RUNNING" || !row.active_run_id) {
      throw new PipelineStateError(
        "STALE_RUN",
        "This step does not have an active run to recover.",
      );
    }

    const heartbeat = database
      .prepare(
        "SELECT heartbeat_at FROM project_steps WHERE project_id = ? AND step_key = ?",
      )
      .get(input.projectId, input.step) as { heartbeat_at: string | null };
    const heartbeatTime = heartbeat.heartbeat_at
      ? Date.parse(heartbeat.heartbeat_at)
      : Number.NaN;
    if (
      !Number.isFinite(heartbeatTime) ||
      Date.now() - heartbeatTime <= input.staleRunMs
    ) {
      throw new PipelineStateError(
        "RUN_ALREADY_ACTIVE",
        "This step is still running. Wait for it to finish before recovering it.",
      );
    }

    const now = new Date().toISOString();
    database
      .prepare(
        `
          UPDATE project_steps
          SET status = 'FAILED',
              active_run_id = NULL,
              error_code = 'STALE_RUN',
              error_message = 'The previous run stopped responding. Retry this step.',
              updated_at = ?
          WHERE project_id = ? AND step_key = ? AND active_run_id = ?
        `,
      )
      .run(now, input.projectId, input.step, row.active_run_id);
    if (input.step === "PORTRAITS") {
      database
        .prepare(
          `
            UPDATE characters
            SET portrait_status = 'FAILED',
                portrait_active_run_id = NULL,
                portrait_error_code = 'STALE_RUN',
                portrait_error_message = 'The previous run stopped responding. Retry this portrait.',
                updated_at = ?
            WHERE project_id = ? AND portrait_active_run_id = ?
          `,
        )
        .run(now, input.projectId, row.active_run_id);
    }
    database
      .prepare(
        `
          UPDATE pipeline_runs
          SET status = 'FAILED', finished_at = ?, heartbeat_at = ?,
              error_code = 'STALE_RUN',
              error_message = 'The previous run stopped responding.'
          WHERE id = ? AND status = 'RUNNING'
        `,
      )
      .run(now, now, row.active_run_id);
  })();
}

function heartbeatPipelineRun(dataDir: string, claim: StepClaim): void {
  withDatabaseAt(dataDir, (database) => {
    const now = new Date().toISOString();
    database
      .prepare(
        `
          UPDATE project_steps
          SET heartbeat_at = ?, updated_at = ?
          WHERE project_id = ? AND step_key = ? AND active_run_id = ?
        `,
      )
      .run(now, now, claim.projectId, claim.step, claim.runId);
    database
      .prepare(
        "UPDATE pipeline_runs SET heartbeat_at = ? WHERE id = ? AND status = 'RUNNING'",
      )
      .run(now, claim.runId);
    if (claim.step === "PORTRAITS") {
      database
        .prepare(
          `
            UPDATE characters
            SET portrait_heartbeat_at = ?, updated_at = ?
            WHERE project_id = ? AND portrait_active_run_id = ? AND portrait_status = 'RUNNING'
          `,
        )
        .run(now, now, claim.projectId, claim.runId);
    }
  });
}

function assertPipelineRunActive(dataDir: string, claim: StepClaim): void {
  const active = withDatabaseAt(dataDir, (database) =>
    database
      .prepare(
        "SELECT 1 FROM project_steps WHERE project_id = ? AND step_key = ? AND active_run_id = ? AND status = 'RUNNING'",
      )
      .get(claim.projectId, claim.step, claim.runId),
  );
  if (!active) {
    throw new PipelineStateError(
      "STALE_RUN",
      "This run is no longer active. Recover it before retrying.",
    );
  }
}

function persistGeminiContext(
  dataDir: string,
  claim: StepClaim,
  input: {
    fileName: string;
    fileUri: string;
    contextInteractionId: string;
    modelId: string;
  },
): void {
  withDatabaseAt(dataDir, (database) => {
    database.transaction(() => {
      const active = database
        .prepare(
          "SELECT 1 FROM project_steps WHERE project_id = ? AND step_key = ? AND active_run_id = ? AND status = 'RUNNING'",
        )
        .get(claim.projectId, claim.step, claim.runId);
      if (!active) return;
      const now = new Date().toISOString();
      database
        .prepare(
          `
            UPDATE projects
            SET gemini_file_name = ?,
                gemini_file_uri = ?,
                gemini_context_interaction_id = ?,
                updated_at = ?
            WHERE id = ?
          `,
        )
        .run(
          input.fileName,
          input.fileUri,
          input.contextInteractionId,
          now,
          claim.projectId,
        );
      database
        .prepare(
          `
            INSERT INTO gemini_interactions
              (id, project_id, step_key, interaction_id, model_id, created_at)
            VALUES (?, ?, 'SOURCE', ?, ?, ?)
          `,
        )
        .run(
          randomUUID(),
          claim.projectId,
          input.contextInteractionId,
          input.modelId,
          now,
        );
    })();
  });
}

function persistGeminiFile(
  dataDir: string,
  claim: StepClaim,
  input: { fileName: string; fileUri: string },
): void {
  withDatabaseAt(dataDir, (database) => {
    database
      .prepare(
        `
          UPDATE projects
          SET gemini_file_name = ?, gemini_file_uri = ?, updated_at = ?
          WHERE id = ? AND EXISTS (
            SELECT 1 FROM project_steps
            WHERE project_id = projects.id AND step_key = ? AND active_run_id = ? AND status = 'RUNNING'
          )
        `,
      )
      .run(
        input.fileName,
        input.fileUri,
        new Date().toISOString(),
        claim.projectId,
        claim.step,
        claim.runId,
      );
  });
}

function persistStyleResult(
  dataDir: string,
  claim: StepClaim,
  input: {
    interactionId: string;
    modelId: string;
    style: string;
    previousId: string;
  },
): void {
  withDatabaseAt(dataDir, (database) => {
    database.transaction(() => {
      const active = database
        .prepare(
          "SELECT 1 FROM project_steps WHERE project_id = ? AND step_key = ? AND active_run_id = ? AND status = 'RUNNING'",
        )
        .get(claim.projectId, claim.step, claim.runId);
      if (!active) return;
      const now = new Date().toISOString();
      database
        .prepare(
          "UPDATE projects SET style_text = ?, updated_at = ? WHERE id = ?",
        )
        .run(input.style, now, claim.projectId);
      database
        .prepare(
          `
            INSERT INTO gemini_interactions
              (id, project_id, step_key, interaction_id, model_id, previous_interaction_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          randomUUID(),
          claim.projectId,
          claim.step,
          input.interactionId,
          input.modelId,
          input.previousId,
          now,
        );
      completePipelineRun(database, claim, now);
    })();
  });
}

function persistCharacterResult(
  dataDir: string,
  claim: StepClaim,
  input: {
    characters: Array<{ name: string; prompt: string }>;
    interactionId: string;
    modelId: string;
    previousId: string;
  },
): void {
  withDatabaseAt(dataDir, (database) => {
    database.transaction(() => {
      const active = database
        .prepare(
          "SELECT 1 FROM project_steps WHERE project_id = ? AND step_key = ? AND active_run_id = ? AND status = 'RUNNING'",
        )
        .get(claim.projectId, claim.step, claim.runId);
      if (!active) return;
      const now = new Date().toISOString();
      input.characters.forEach((character, position) => {
        database
          .prepare(
            `
              INSERT INTO characters
                (id, project_id, position, name, prompt, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
          )
          .run(
            randomUUID(),
            claim.projectId,
            position,
            character.name,
            character.prompt,
            now,
            now,
          );
      });
      database
        .prepare(
          `
            INSERT INTO gemini_interactions
              (id, project_id, step_key, interaction_id, model_id, previous_interaction_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          randomUUID(),
          claim.projectId,
          claim.step,
          input.interactionId,
          input.modelId,
          input.previousId,
          now,
        );
      completePipelineRun(database, claim, now);
    })();
  });
}

function persistPortraitSuccess(
  dataDir: string,
  claim: StepClaim,
  characterId: string,
  asset: StoredImageAsset,
): boolean {
  return withDatabaseAt(dataDir, (database) =>
    database.transaction(() => {
      const active = database
        .prepare(
          `
            SELECT 1
            FROM characters c
            INNER JOIN project_steps ps ON ps.project_id = c.project_id
              AND ps.step_key = 'PORTRAITS'
            WHERE c.project_id = ?
              AND c.id = ?
              AND c.portrait_active_run_id = ?
              AND c.portrait_status = 'RUNNING'
              AND ps.active_run_id = ?
              AND ps.status = 'RUNNING'
          `,
        )
        .get(claim.projectId, characterId, claim.runId, claim.runId);
      if (!active) return false;

      const now = new Date().toISOString();
      database
        .prepare(
          `
            INSERT INTO assets
              (id, project_id, kind, storage_key, mime_type, byte_size, checksum, created_at, updated_at)
            VALUES (?, ?, 'PORTRAIT', ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          asset.id,
          claim.projectId,
          asset.storageKey,
          asset.mimeType,
          asset.byteSize,
          asset.checksum,
          now,
          now,
        );
      const result = database
        .prepare(
          `
            UPDATE characters
            SET portrait_status = 'COMPLETED',
                portrait_active_run_id = NULL,
                portrait_heartbeat_at = ?,
                portrait_error_code = NULL,
                portrait_error_message = NULL,
                portrait_asset_id = ?,
                updated_at = ?
            WHERE project_id = ? AND id = ? AND portrait_active_run_id = ?
          `,
        )
        .run(now, asset.id, now, claim.projectId, characterId, claim.runId);
      if (result.changes !== 1) {
        throw new PipelineStateError(
          "STALE_RUN",
          "This portrait run is no longer active.",
        );
      }
      return true;
    })(),
  );
}

function persistPortraitFailure(
  dataDir: string,
  claim: StepClaim,
  characterId: string,
  error: unknown,
): void {
  const code =
    error instanceof GeminiOutputError
      ? error.code
      : error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "GEMINI_FAILED";
  const message =
    error instanceof Error ? error.message : "Portrait generation failed.";

  withDatabaseAt(dataDir, (database) => {
    database
      .prepare(
        `
          UPDATE characters
          SET portrait_status = 'FAILED',
              portrait_active_run_id = NULL,
              portrait_heartbeat_at = ?,
              portrait_error_code = ?,
              portrait_error_message = ?,
              updated_at = ?
          WHERE project_id = ? AND id = ? AND portrait_active_run_id = ?
        `,
      )
      .run(
        new Date().toISOString(),
        code,
        message,
        new Date().toISOString(),
        claim.projectId,
        characterId,
        claim.runId,
      );
  });
}

function getPortraitRunInput(
  dataDir: string,
  claim: StepClaim,
  characterId?: string,
): {
  characters: Array<{ id: string; name: string; prompt: string }>;
  style: string;
} {
  return withDatabaseAt(dataDir, (database) => {
    const project = database
      .prepare(
        `
          SELECT style_text
          FROM projects p
          INNER JOIN project_steps ps ON ps.project_id = p.id
          WHERE p.id = ? AND ps.step_key = 'PORTRAITS'
            AND ps.active_run_id = ? AND ps.status = 'RUNNING'
        `,
      )
      .get(claim.projectId, claim.runId) as
      { style_text: string | null } | undefined;
    if (!project?.style_text) {
      throw new PipelineStateError(
        "STEP_ORDER",
        "Complete Style before generating portraits.",
      );
    }

    const characters = database
      .prepare(
        `
          SELECT id, name, prompt
          FROM characters
          WHERE project_id = ?
            AND portrait_active_run_id = ?
            AND portrait_status = 'RUNNING'
            ${characterId ? "AND id = ?" : ""}
          ORDER BY position ASC
        `,
      )
      .all(
        ...(characterId
          ? [claim.projectId, claim.runId, characterId]
          : [claim.projectId, claim.runId]),
      ) as Array<{ id: string; name: string; prompt: string }>;
    if (characters.length === 0) {
      throw new PipelineStateError(
        "STALE_RUN",
        "No active portrait items remain for this run.",
      );
    }
    return { characters, style: project.style_text };
  });
}

async function executePortraits(
  dataDir: string,
  claim: StepClaim,
  characterId: string | undefined,
  adapter: GeminiImageAdapter,
): Promise<void> {
  const input = getPortraitRunInput(dataDir, claim, characterId);
  const results = await Promise.allSettled(
    input.characters.map(async (character) => {
      let asset: StoredImageAsset | undefined;
      try {
        const generated = await adapter.generatePortrait({
          characterName: character.name,
          characterPrompt: character.prompt,
          style: input.style,
        });
        assertPipelineRunActive(dataDir, claim);
        asset = writeImageAsset(dataDir, generated);
        const persisted = persistPortraitSuccess(
          dataDir,
          claim,
          character.id,
          asset,
        );
        if (!persisted) {
          removeImageAsset(asset);
          throw new PipelineStateError(
            "STALE_RUN",
            "This portrait run is no longer active.",
          );
        }
        heartbeatPipelineRun(dataDir, claim);
      } catch (error) {
        if (asset) removeImageAsset(asset);
        persistPortraitFailure(dataDir, claim, character.id, error);
        throw error;
      }
    }),
  );

  const hasFailures = results.some((result) => result.status === "rejected");
  if (hasFailures) {
    failPipelineRun(
      dataDir,
      claim,
      new PipelineStateError(
        "PORTRAIT_PARTIAL_FAILURE",
        "One or more portraits failed. Retry the failed portraits.",
      ),
    );
    return;
  }

  withDatabaseAt(dataDir, (database) => {
    const incomplete = database
      .prepare(
        "SELECT 1 FROM characters WHERE project_id = ? AND portrait_status != 'COMPLETED' LIMIT 1",
      )
      .get(claim.projectId);
    if (incomplete) {
      failPipelineRun(
        dataDir,
        claim,
        new PipelineStateError(
          "PORTRAIT_PARTIAL_FAILURE",
          "Some portraits still need attention.",
        ),
      );
      return;
    }
    completePipelineRun(database, claim, new Date().toISOString());
  });
}

function completePipelineRun(
  database: Database.Database,
  claim: StepClaim,
  now: string,
): boolean {
  const active = database
    .prepare(
      "SELECT 1 FROM project_steps WHERE project_id = ? AND step_key = ? AND active_run_id = ? AND status = 'RUNNING'",
    )
    .get(claim.projectId, claim.step, claim.runId);
  if (!active) return false;
  const result = database
    .prepare(
      `
        UPDATE project_steps
        SET status = 'COMPLETED', active_run_id = NULL,
            heartbeat_at = ?, error_code = NULL, error_message = NULL, updated_at = ?
        WHERE project_id = ? AND step_key = ? AND active_run_id = ?
      `,
    )
    .run(now, now, claim.projectId, claim.step, claim.runId);
  if (result.changes !== 1) return false;
  database
    .prepare(
      "UPDATE pipeline_runs SET status = 'COMPLETED', finished_at = ?, heartbeat_at = ? WHERE id = ?",
    )
    .run(now, now, claim.runId);
  return true;
}

function failPipelineRun(
  dataDir: string,
  claim: StepClaim,
  error: unknown,
): void {
  const code =
    error instanceof GeminiOutputError
      ? error.code
      : error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "GEMINI_FAILED";
  const message =
    error instanceof Error ? error.message : "Gemini generation failed.";

  withDatabaseAt(dataDir, (database) => {
    database.transaction(() => {
      const now = new Date().toISOString();
      const result = database
        .prepare(
          `
            UPDATE project_steps
            SET status = 'FAILED', active_run_id = NULL,
                heartbeat_at = ?, error_code = ?, error_message = ?, updated_at = ?
            WHERE project_id = ? AND step_key = ? AND active_run_id = ?
          `,
        )
        .run(now, code, message, now, claim.projectId, claim.step, claim.runId);
      if (result.changes !== 1) return;
      database
        .prepare(
          `
            UPDATE pipeline_runs
            SET status = 'FAILED', finished_at = ?, heartbeat_at = ?,
                error_code = ?, error_message = ?
            WHERE id = ? AND status = 'RUNNING'
          `,
        )
        .run(now, now, code, message, claim.runId);
    })();
  });
}

function withDatabaseAt<T>(
  dataDir: string,
  callback: (database: Database.Database) => T,
): T {
  const database = openDatabase(dataDir);
  try {
    return callback(database);
  } finally {
    database.close();
  }
}

async function ensureBookContext(
  dataDir: string,
  claim: StepClaim,
  adapter: GeminiTextAdapter,
): Promise<string> {
  const project = withDatabaseAt(
    dataDir,
    (database) =>
      database
        .prepare(
          `
          SELECT book_text_key, gemini_file_name, gemini_file_uri, gemini_context_interaction_id
          FROM projects WHERE id = ?
        `,
        )
        .get(claim.projectId) as
        | {
            book_text_key: string;
            gemini_file_name: string | null;
            gemini_file_uri: string | null;
            gemini_context_interaction_id: string | null;
          }
        | undefined,
  );
  if (!project) throw new PipelineStateError("NOT_FOUND", "Project not found.");

  let fileName = project.gemini_file_name;
  let fileUri = project.gemini_file_uri;
  if (!fileName || !fileUri) {
    const uploaded = await adapter.uploadBook(
      resolveBookPath(dataDir, project.book_text_key),
    );
    assertPipelineRunActive(dataDir, claim);
    fileName = uploaded.name;
    fileUri = uploaded.uri;
    persistGeminiFile(dataDir, claim, { fileName, fileUri });
    heartbeatPipelineRun(dataDir, claim);
  }

  let contextInteractionId = project.gemini_context_interaction_id;
  if (!contextInteractionId) {
    const context = await adapter.createBookContext(fileUri);
    assertPipelineRunActive(dataDir, claim);
    contextInteractionId = context.id;
    persistGeminiContext(dataDir, claim, {
      contextInteractionId,
      fileName,
      fileUri,
      modelId: adapter.modelId,
    });
    heartbeatPipelineRun(dataDir, claim);
  } else if (!project.gemini_file_name || !project.gemini_file_uri) {
    persistGeminiFile(dataDir, claim, { fileName, fileUri });
  }

  return contextInteractionId;
}

async function executeStyle(
  dataDir: string,
  claim: StepClaim,
  requestedStyle: string,
  adapter: GeminiTextAdapter,
): Promise<void> {
  const contextInteractionId = await ensureBookContext(dataDir, claim, adapter);
  const prompt = requestedStyle
    ? `The art style is: "${requestedStyle}". Store it as the canonical visual language for all future prompts. Reply only "Style saved."`
    : "Define an art style that fits the story with a distinctive twist. Return only the art-style prompt that should be applied to future illustration prompts.";
  const interaction = await adapter.createTextInteraction({
    previousInteractionId: contextInteractionId,
    prompt,
  });
  heartbeatPipelineRun(dataDir, claim);
  const style = requestedStyle || parseGeneratedStyle(interaction.outputText);
  persistStyleResult(dataDir, claim, {
    interactionId: interaction.id,
    modelId: adapter.modelId,
    previousId: contextInteractionId,
    style,
  });
}

async function executeCharacters(
  dataDir: string,
  claim: StepClaim,
  adapter: GeminiTextAdapter,
): Promise<void> {
  const previousInteractionId = withDatabaseAt(
    dataDir,
    (database) =>
      database
        .prepare(
          `
          SELECT interaction_id
          FROM gemini_interactions
          WHERE project_id = ? AND step_key = 'STYLE'
          ORDER BY created_at DESC
          LIMIT 1
        `,
        )
        .get(claim.projectId) as { interaction_id: string } | undefined,
  )?.interaction_id;
  if (!previousInteractionId) {
    throw new PipelineStateError(
      "STEP_ORDER",
      "The Style interaction is missing; run Style again before Characters.",
    );
  }

  const interaction = await adapter.createTextInteraction({
    previousInteractionId,
    prompt:
      "Describe the main characters, adults only. Return at most two characters. Each character must be an adult and must include a detailed image-generation prompt of at least 50 words. Keep the established art style. Return only the requested JSON array.",
    responseFormat: CHARACTER_RESPONSE_FORMAT,
  });
  heartbeatPipelineRun(dataDir, claim);
  const characters = parseGeneratedCharacters(interaction.outputText);
  persistCharacterResult(dataDir, claim, {
    characters,
    interactionId: interaction.id,
    modelId: adapter.modelId,
    previousId: previousInteractionId,
  });
}

export async function executePipelineRun(input: {
  claim: StepClaim;
  dataDir: string;
  requestedStyle?: string;
  staleRunMs: number;
  adapter?: GeminiTextAdapter;
  imageAdapter?: GeminiImageAdapter;
  portraitCharacterId?: string;
}): Promise<void> {
  try {
    if (input.claim.step === "STYLE") {
      const adapter =
        input.adapter ??
        createGeminiTextAdapter(
          loadServerEnv({
            requireGeminiKey: true,
            requireTextModel: true,
          }),
        );
      await executeStyle(
        input.dataDir,
        input.claim,
        normalizeOptionalStyle(input.requestedStyle),
        adapter,
      );
    } else if (input.claim.step === "CHARACTERS") {
      const adapter =
        input.adapter ??
        createGeminiTextAdapter(
          loadServerEnv({
            requireGeminiKey: true,
            requireTextModel: true,
          }),
        );
      await executeCharacters(input.dataDir, input.claim, adapter);
    } else if (input.claim.step === "PORTRAITS") {
      const adapter =
        input.imageAdapter ??
        createGeminiImageAdapter(
          loadServerEnv({
            requireGeminiKey: true,
            requireImageModel: true,
          }),
        );
      await executePortraits(
        input.dataDir,
        input.claim,
        input.portraitCharacterId,
        adapter,
      );
    } else {
      throw new PipelineStateError(
        "STEP_NOT_AVAILABLE",
        "This pipeline step is not available in this milestone.",
      );
    }
  } catch (error) {
    failPipelineRun(input.dataDir, input.claim, error);
  }
}

export function startPipelineRun(input: {
  claim: StepClaim;
  dataDir: string;
  requestedStyle?: string;
  staleRunMs: number;
  adapter?: GeminiTextAdapter;
  imageAdapter?: GeminiImageAdapter;
  portraitCharacterId?: string;
}): void {
  void executePipelineRun(input);
}
