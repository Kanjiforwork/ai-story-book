import crypto, { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import { PIPELINE_STEP_LABELS, PIPELINE_STEPS } from "@/domain/pipeline";
import type {
  CharacterView,
  ChapterView,
  IllustrationItemStatus,
  PortraitItemStatus,
  ProjectAttemptHistoryItem,
  ProjectDetailView,
  ProjectStepAttemptView,
  ProjectStatus,
  ProjectStepRunView,
  ProjectStepStatus,
  ProjectStepView,
  ProjectSummary,
} from "@/domain/project";
import { normalizeProjectTitle } from "@/domain/validation";
import {
  normalizeBookText,
  readBookText,
  removeBookText,
  writeBookTextAtomically,
} from "@/server/book-text";
import {
  createInitialGenerationRun,
  listGenerationRuns,
} from "@/server/generation-run-service";

type ProjectRow = {
  id: string;
  title: string;
  book_text_key: string;
  created_at: string;
  active_generation_run_id: string;
  source_snapshot_hash: string;
  step_statuses: string;
};

type StepRow = {
  generation_run_id: string;
  active_run_id: string | null;
  attempt_count: number;
  claimed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  heartbeat_at: string | null;
  step_key: (typeof PIPELINE_STEPS)[number];
  position: number;
  status: ProjectStepStatus;
};

type StepAttemptRow = {
  attempt: number;
  claimed_at: string;
  error_code: string | null;
  error_message: string | null;
  finished_at: string | null;
  status: ProjectStepAttemptView["status"];
  step_key: (typeof PIPELINE_STEPS)[number];
};

type ProjectAttemptHistoryRow = {
  id: string;
  project_id: string;
  project_title: string;
  generation_run_id: string;
  step_key: (typeof PIPELINE_STEPS)[number];
  attempt: number;
  status: ProjectStepAttemptView["status"];
  claimed_at: string;
  finished_at: string | null;
  error_code: string | null;
  error_message: string | null;
};

type CharacterRow = {
  id: string;
  generation_run_id: string;
  name: string;
  position: number;
  prompt: string;
  portrait_active_run_id: string | null;
  portrait_asset_id: string | null;
  portrait_attempt_count: number;
  portrait_claimed_at: string | null;
  portrait_error_code: string | null;
  portrait_error_message: string | null;
  portrait_heartbeat_at: string | null;
  portrait_status: PortraitItemStatus;
};

type ChapterRow = {
  id: string;
  generation_run_id: string;
  name: string;
  position: number;
  prompt: string;
  illustration_active_run_id: string | null;
  illustration_asset_id: string | null;
  illustration_attempt_count: number;
  illustration_claimed_at: string | null;
  illustration_error_code: string | null;
  illustration_error_message: string | null;
  illustration_heartbeat_at: string | null;
  illustration_status: IllustrationItemStatus;
};

export const DEFAULT_STALE_RUN_MS = 120_000;

function deriveProjectStatus(
  statuses: readonly ProjectStepStatus[],
): ProjectStatus {
  if (
    statuses.length === PIPELINE_STEPS.length &&
    statuses.every((status) => status === "COMPLETED")
  ) {
    return "DONE";
  }
  if (statuses.some((status) => status !== "PENDING")) return "IN_PROGRESS";
  return "DRAFT";
}

function toStepViews(
  rows: readonly StepRow[],
  attemptRows: readonly StepAttemptRow[],
  staleRunMs: number,
  now = Date.now(),
): ProjectStepView[] {
  return rows.map((row) => ({
    attempts: attemptRows
      .filter((attempt) => attempt.step_key === row.step_key)
      .map((attempt) => ({
        attempt: attempt.attempt,
        claimedAt: attempt.claimed_at,
        errorCode: attempt.error_code,
        errorMessage: attempt.error_message,
        finishedAt: attempt.finished_at,
        status: attempt.status,
      })),
    key: row.step_key,
    position: row.position,
    status: row.status,
    run: toStepRunView(row, staleRunMs, now),
  }));
}

function toStepRunView(
  row: StepRow,
  staleRunMs: number,
  now: number,
): ProjectStepRunView {
  const heartbeatTime = row.heartbeat_at
    ? Date.parse(row.heartbeat_at)
    : Number.NaN;
  const isStale =
    row.status === "RUNNING" &&
    (!Number.isFinite(heartbeatTime) || now - heartbeatTime > staleRunMs);

  return {
    attempt: row.attempt_count,
    claimedAt: row.claimed_at,
    heartbeatAt: row.heartbeat_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    isStale,
  };
}

function toPortraitView(
  row: CharacterRow,
  staleRunMs: number,
  now: number,
): CharacterView["portrait"] {
  const heartbeatTime = row.portrait_heartbeat_at
    ? Date.parse(row.portrait_heartbeat_at)
    : Number.NaN;
  const isStale =
    row.portrait_status === "RUNNING" &&
    (!Number.isFinite(heartbeatTime) || now - heartbeatTime > staleRunMs);

  return {
    attempt: row.portrait_attempt_count,
    assetId: row.portrait_asset_id,
    assetUrl: row.portrait_asset_id
      ? `/api/assets/${row.portrait_asset_id}`
      : null,
    claimedAt: row.portrait_claimed_at,
    errorCode: row.portrait_error_code,
    errorMessage: row.portrait_error_message,
    heartbeatAt: row.portrait_heartbeat_at,
    isStale,
    status: row.portrait_status,
  };
}

function toIllustrationView(
  row: ChapterRow,
  staleRunMs: number,
  now: number,
): ChapterView["illustration"] {
  const heartbeatTime = row.illustration_heartbeat_at
    ? Date.parse(row.illustration_heartbeat_at)
    : Number.NaN;
  const isStale =
    row.illustration_status === "RUNNING" &&
    (!Number.isFinite(heartbeatTime) || now - heartbeatTime > staleRunMs);

  return {
    attempt: row.illustration_attempt_count,
    assetId: row.illustration_asset_id,
    assetUrl: row.illustration_asset_id
      ? `/api/assets/${row.illustration_asset_id}`
      : null,
    claimedAt: row.illustration_claimed_at,
    errorCode: row.illustration_error_code,
    errorMessage: row.illustration_error_message,
    heartbeatAt: row.illustration_heartbeat_at,
    isStale,
    status: row.illustration_status,
  };
}

function toSummary(row: ProjectRow): ProjectSummary {
  const statuses = row.step_statuses.split(",") as ProjectStepStatus[];
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    status: deriveProjectStatus(statuses),
    completedSteps: statuses.filter((status) => status === "COMPLETED").length,
    totalSteps: PIPELINE_STEPS.length,
    activeGenerationRunId: row.active_generation_run_id,
  };
}

function selectProjectRows(
  database: Database.Database,
  userId: string,
  projectId?: string,
): ProjectRow[] {
  const whereProject = projectId ? "AND p.id = @projectId" : "";
  return database
    .prepare(
      `
        SELECT
          p.id,
          p.title,
          p.book_text_key,
          p.created_at,
          p.active_generation_run_id,
          p.source_snapshot_hash,
          (
            SELECT GROUP_CONCAT(ordered_steps.status, ',')
            FROM (
              SELECT status
              FROM project_steps
              WHERE generation_run_id = p.active_generation_run_id
              ORDER BY position ASC
            ) AS ordered_steps
          ) AS step_statuses
        FROM projects p
        WHERE p.user_id = @userId
          ${whereProject}
          AND EXISTS (
            SELECT 1 FROM project_steps ps
            WHERE ps.generation_run_id = p.active_generation_run_id
          )
        ORDER BY p.created_at DESC, p.id DESC
      `,
    )
    .all({ userId, projectId }) as ProjectRow[];
}

export function createProject(
  database: Database.Database,
  input: { userId: string; title: unknown; bookText: string; dataDir: string },
): ProjectDetailView {
  const title = normalizeProjectTitle(input.title);
  const bookText = normalizeBookText(input.bookText);
  const projectId = randomUUID();
  const bookTextKey = writeBookTextAtomically(input.dataDir, bookText);
  const sourceSnapshotHash = crypto
    .createHash("sha256")
    .update(bookText)
    .digest("hex");
  const timestamp = new Date().toISOString();

  try {
    const insertProject = database.transaction(() => {
      database
        .prepare(
          `
            INSERT INTO projects
              (id, user_id, title, book_text_key, book_text_characters,
               source_snapshot_hash, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          projectId,
          input.userId,
          title,
          bookTextKey,
          bookText.length,
          sourceSnapshotHash,
          timestamp,
          timestamp,
        );

      const generationRunId = createInitialGenerationRun(database, {
        createdAt: timestamp,
        projectId,
        sourceSnapshotHash,
      });
      database
        .prepare(
          "UPDATE projects SET active_generation_run_id = ? WHERE id = ?",
        )
        .run(generationRunId, projectId);

      const insertStep = database.prepare(
        `
          INSERT INTO project_steps
            (generation_run_id, project_id, step_key, position, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
        `,
      );
      PIPELINE_STEPS.forEach((step, index) => {
        insertStep.run(
          generationRunId,
          projectId,
          step,
          index,
          timestamp,
          timestamp,
        );
      });
    });

    insertProject();
  } catch (error) {
    removeBookText(input.dataDir, bookTextKey);
    throw error;
  }

  const detail = getProjectDetail(
    database,
    input.userId,
    projectId,
    input.dataDir,
  );
  if (!detail) throw new Error("Created project could not be read back.");
  return detail;
}

export function listProjects(
  database: Database.Database,
  userId: string,
): ProjectSummary[] {
  return selectProjectRows(database, userId).map(toSummary);
}

export function listAttemptHistory(
  database: Database.Database,
  userId: string,
  projectId?: string,
): ProjectAttemptHistoryItem[] {
  const projectFilter = projectId ? "AND p.id = @projectId" : "";
  const rows = database
    .prepare(
      `
        SELECT
          pr.id,
          pr.project_id,
          p.title AS project_title,
          pr.generation_run_id,
          pr.step_key,
          pr.attempt,
          pr.status,
          pr.claimed_at,
          pr.finished_at,
          pr.error_code,
          pr.error_message
        FROM pipeline_runs pr
        INNER JOIN projects p ON p.id = pr.project_id
        WHERE p.user_id = @userId
          ${projectFilter}
        ORDER BY pr.claimed_at DESC, pr.id DESC
      `,
    )
    .all(
      projectId ? { projectId, userId } : { userId },
    ) as ProjectAttemptHistoryRow[];

  return rows.map((attempt) => ({
    attempt: attempt.attempt,
    claimedAt: attempt.claimed_at,
    errorCode: attempt.error_code,
    errorMessage: attempt.error_message,
    finishedAt: attempt.finished_at,
    generationRunId: attempt.generation_run_id,
    id: attempt.id,
    projectId: attempt.project_id,
    projectTitle: attempt.project_title,
    status: attempt.status,
    step: attempt.step_key,
  }));
}

export function getProjectDetail(
  database: Database.Database,
  userId: string,
  projectId: string,
  dataDir: string,
  staleRunMs = DEFAULT_STALE_RUN_MS,
): ProjectDetailView | null {
  const row = selectProjectRows(database, userId, projectId)[0];
  if (!row) return null;

  const stepRows = database
    .prepare(
      `
        SELECT
          generation_run_id,
          step_key,
          position,
          status,
          active_run_id,
          attempt_count,
          claimed_at,
          heartbeat_at,
          error_code,
          error_message
        FROM project_steps
        WHERE generation_run_id = ?
        ORDER BY position ASC
      `,
    )
    .all(row.active_generation_run_id) as StepRow[];
  const stepAttemptRows = database
    .prepare(
      `
        SELECT step_key, attempt, status, claimed_at, finished_at,
          error_code, error_message
        FROM pipeline_runs
        WHERE generation_run_id = ?
        ORDER BY step_key ASC, attempt ASC
      `,
    )
    .all(row.active_generation_run_id) as StepAttemptRow[];
  const characterRows = database
    .prepare(
      `
        SELECT
          c.id,
          c.generation_run_id,
          c.name,
          c.position,
          c.prompt,
          c.portrait_active_run_id,
          c.portrait_asset_id,
          c.portrait_attempt_count,
          c.portrait_claimed_at,
          c.portrait_error_code,
          c.portrait_error_message,
          c.portrait_heartbeat_at,
          c.portrait_status
        FROM characters AS c
        WHERE c.generation_run_id = ?
        ORDER BY c.position ASC
      `,
    )
    .all(row.active_generation_run_id) as CharacterRow[];
  const chapterRows = database
    .prepare(
      `
        SELECT
          ch.id,
          ch.generation_run_id,
          ch.name,
          ch.position,
          ch.prompt,
          ch.illustration_active_run_id,
          ch.illustration_asset_id,
          ch.illustration_attempt_count,
          ch.illustration_claimed_at,
          ch.illustration_error_code,
          ch.illustration_error_message,
          ch.illustration_heartbeat_at,
          ch.illustration_status
        FROM chapters AS ch
        WHERE ch.generation_run_id = ?
        ORDER BY ch.position ASC
      `,
    )
    .all(row.active_generation_run_id) as ChapterRow[];
  const now = Date.now();
  const characters: CharacterView[] = characterRows.map((character) => ({
    id: character.id,
    name: character.name,
    position: character.position,
    prompt: character.prompt,
    portrait: toPortraitView(character, staleRunMs, now),
  }));
  const summary = toSummary(row);
  const chapters: ChapterView[] = chapterRows.map((chapter) => ({
    id: chapter.id,
    name: chapter.name,
    position: chapter.position,
    prompt: chapter.prompt,
    illustration: toIllustrationView(chapter, staleRunMs, now),
  }));

  const activeRun = database
    .prepare("SELECT status, style_text FROM generation_runs WHERE id = ?")
    .get(row.active_generation_run_id) as
    { status: string; style_text: string | null } | undefined;
  const generationRuns = listGenerationRuns(database, userId, projectId) ?? [];
  const selectedGenerationRun = generationRuns.find((run) => run.isSelected);

  return {
    ...summary,
    attemptHistory: listAttemptHistory(database, userId, projectId),
    bookText: readBookText(dataDir, row.book_text_key),
    characters,
    chapters,
    style: activeRun?.style_text ?? null,
    steps: toStepViews(stepRows, stepAttemptRows, staleRunMs).map((step) => ({
      ...step,
      generationRunId: row.active_generation_run_id,
    })),
    activeGenerationRunId: row.active_generation_run_id,
    selectedRunReadOnly: !selectedGenerationRun?.isWritable,
    generationRuns,
  };
}

export function getStepLabel(step: (typeof PIPELINE_STEPS)[number]): string {
  return PIPELINE_STEP_LABELS[step];
}
