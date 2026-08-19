import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import { PIPELINE_STEP_LABELS, PIPELINE_STEPS } from "@/domain/pipeline";
import type {
  CharacterView,
  ProjectDetailView,
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

type ProjectRow = {
  id: string;
  title: string;
  book_text_key: string;
  created_at: string;
  style_text: string | null;
  step_statuses: string;
};

type StepRow = {
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
  staleRunMs: number,
  now = Date.now(),
): ProjectStepView[] {
  return rows.map((row) => ({
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
    Number.isFinite(heartbeatTime) &&
    now - heartbeatTime > staleRunMs;

  return {
    attempt: row.attempt_count,
    claimedAt: row.claimed_at,
    heartbeatAt: row.heartbeat_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    isStale,
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
          p.style_text,
          (
            SELECT GROUP_CONCAT(ordered_steps.status, ',')
            FROM (
              SELECT status
              FROM project_steps
              WHERE project_id = p.id
              ORDER BY position ASC
            ) AS ordered_steps
          ) AS step_statuses
        FROM projects p
        WHERE p.user_id = @userId
          ${whereProject}
          AND EXISTS (
            SELECT 1 FROM project_steps ps WHERE ps.project_id = p.id
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
  const timestamp = new Date().toISOString();

  try {
    const insertProject = database.transaction(() => {
      database
        .prepare(
          `
            INSERT INTO projects
              (id, user_id, title, book_text_key, book_text_characters, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          projectId,
          input.userId,
          title,
          bookTextKey,
          bookText.length,
          timestamp,
          timestamp,
        );

      const insertStep = database.prepare(
        `
          INSERT INTO project_steps
            (project_id, step_key, position, status, created_at, updated_at)
          VALUES (?, ?, ?, 'PENDING', ?, ?)
        `,
      );
      PIPELINE_STEPS.forEach((step, index) => {
        insertStep.run(projectId, step, index, timestamp, timestamp);
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
        WHERE project_id = ?
        ORDER BY position ASC
      `,
    )
    .all(projectId) as StepRow[];
  const characters = database
    .prepare(
      `
        SELECT id, name, position, prompt
        FROM characters
        WHERE project_id = ?
        ORDER BY position ASC
      `,
    )
    .all(projectId) as CharacterView[];
  const summary = toSummary(row);

  return {
    ...summary,
    bookText: readBookText(dataDir, row.book_text_key),
    characters,
    style: row.style_text,
    steps: toStepViews(stepRows, staleRunMs),
  };
}

export function getStepLabel(step: (typeof PIPELINE_STEPS)[number]): string {
  return PIPELINE_STEP_LABELS[step];
}
