import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import { PIPELINE_STEP_LABELS, PIPELINE_STEPS } from "@/domain/pipeline";
import type {
  ProjectDetailView,
  ProjectStatus,
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
  step_statuses: string;
};

type StepRow = {
  step_key: (typeof PIPELINE_STEPS)[number];
  position: number;
  status: ProjectStepStatus;
};

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

function toStepViews(rows: readonly StepRow[]): ProjectStepView[] {
  return rows.map((row) => ({
    key: row.step_key,
    position: row.position,
    status: row.status,
  }));
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
): ProjectDetailView | null {
  const row = selectProjectRows(database, userId, projectId)[0];
  if (!row) return null;

  const stepRows = database
    .prepare(
      `
        SELECT step_key, position, status
        FROM project_steps
        WHERE project_id = ?
        ORDER BY position ASC
      `,
    )
    .all(projectId) as StepRow[];
  const summary = toSummary(row);

  return {
    ...summary,
    bookText: readBookText(dataDir, row.book_text_key),
    steps: toStepViews(stepRows),
  };
}

export function getStepLabel(step: (typeof PIPELINE_STEPS)[number]): string {
  return PIPELINE_STEP_LABELS[step];
}
