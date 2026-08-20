import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createUserSession } from "@/server/auth";
import { PIPELINE_STEPS } from "@/domain/pipeline";
import {
  createProject,
  getProjectDetail,
  listAttemptHistory,
  listProjects,
} from "@/server/project-service";
import { openDatabase } from "@/server/storage";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("project persistence", () => {
  it("stores source text and creates five pending ordered steps", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "gradion-project-test-"),
    );
    temporaryDirectories.push(directory);
    const dataDir = path.join(directory, "data");
    const database = openDatabase(dataDir);
    const { user } = createUserSession(database, {
      email: "mira@example.com",
      name: "Mira Hassan",
    });

    const project = createProject(database, {
      bookText: "Once upon a time.\r\nA river ran beside the burrow.",
      dataDir,
      title: "River Burrow",
      userId: user.id,
    });

    expect(project.status).toBe("DRAFT");
    expect(project.bookText).toContain("Once upon a time.\n");
    expect(project.steps.map((step) => step.key)).toEqual([...PIPELINE_STEPS]);
    expect(project.steps.every((step) => step.status === "PENDING")).toBe(true);
    expect(listProjects(database, user.id)).toEqual([
      expect.objectContaining({ id: project.id, title: "River Burrow" }),
    ]);
    expect(
      getProjectDetail(database, "another-user", project.id, dataDir),
    ).toBeNull();

    database
      .prepare(
        "UPDATE project_steps SET status = 'COMPLETED' WHERE project_id = ? AND step_key IN ('STYLE', 'CHARACTERS')",
      )
      .run(project.id);
    expect(listProjects(database, user.id)[0]).toEqual(
      expect.objectContaining({
        completedSteps: 2,
        status: "IN_PROGRESS",
      }),
    );

    const firstAttempt = "2026-01-01T10:00:00.000Z";
    const secondAttempt = "2026-01-01T10:05:00.000Z";
    database
      .prepare(
        `INSERT INTO pipeline_runs
          (id, project_id, generation_run_id, step_key, attempt, status,
           claimed_at, heartbeat_at, finished_at, error_code, error_message)
         VALUES (?, ?, ?, 'STYLE', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "style-attempt-1",
        project.id,
        project.activeGenerationRunId,
        1,
        "FAILED",
        firstAttempt,
        firstAttempt,
        firstAttempt,
        "GEMINI_FAILED",
        "Gemini was unavailable.",
      );
    database
      .prepare(
        `INSERT INTO pipeline_runs
          (id, project_id, generation_run_id, step_key, attempt, status,
           claimed_at, heartbeat_at, finished_at, error_code, error_message)
         VALUES (?, ?, ?, 'STYLE', 2, 'COMPLETED', ?, ?, ?, NULL, NULL)`,
      )
      .run(
        "style-attempt-2",
        project.id,
        project.activeGenerationRunId,
        secondAttempt,
        secondAttempt,
        secondAttempt,
      );
    expect(
      getProjectDetail(database, user.id, project.id, dataDir)?.steps[0]
        .attempts,
    ).toEqual([
      expect.objectContaining({ attempt: 1, status: "FAILED" }),
      expect.objectContaining({ attempt: 2, status: "COMPLETED" }),
    ]);
    expect(listAttemptHistory(database, user.id, project.id)).toEqual([
      expect.objectContaining({
        attempt: 2,
        projectId: project.id,
        projectTitle: "River Burrow",
        status: "COMPLETED",
        step: "STYLE",
      }),
      expect.objectContaining({
        attempt: 1,
        errorMessage: "Gemini was unavailable.",
        projectId: project.id,
        status: "FAILED",
      }),
    ]);
    expect(listAttemptHistory(database, "another-user")).toEqual([]);

    database.close();
  });
});
