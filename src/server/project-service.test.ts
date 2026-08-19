import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createUserSession } from "@/server/auth";
import { PIPELINE_STEPS } from "@/domain/pipeline";
import {
  createProject,
  getProjectDetail,
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
    database.close();
  });
});
