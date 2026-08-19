import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignOutButton } from "@/components/sign-out-button";
import { IdentityForm } from "@/components/identity-form";
import { ProjectDetail } from "@/components/project-detail";
import type { ProjectDetailView } from "@/domain/project";
import type { AuthenticatedUser } from "@/server/auth";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const user: AuthenticatedUser = {
  email: "mira@example.com",
  id: "user-1",
  name: "Mira Hassan",
};

function projectFixture(): ProjectDetailView {
  return {
    bookText: "A river ran beside the burrow.",
    characters: [],
    completedSteps: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "project-1",
    status: "DRAFT",
    steps: [
      "STYLE",
      "CHARACTERS",
      "PORTRAITS",
      "CHAPTERS",
      "ILLUSTRATIONS",
    ].map((key, position) => ({
      key: key as ProjectDetailView["steps"][number]["key"],
      position,
      run: {
        attempt: 0,
        claimedAt: null,
        errorCode: null,
        errorMessage: null,
        heartbeatAt: null,
        isStale: false,
      },
      status: "PENDING",
    })),
    style: null,
    title: "River Burrow",
    totalSteps: 5,
  };
}

describe("foundation app shell", () => {
  it("shows the studio title and the five-step contract", () => {
    render(<IdentityForm />);

    expect(
      screen.getByRole("heading", { name: "Welcome to the studio" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("keeps a retryable error when sign out fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Sign out failed. Try again.",
      );
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/session", {
      method: "DELETE",
    });
  });

  it("starts Style explicitly and renders the saved result", async () => {
    const initial = projectFixture();
    const completed = {
      ...initial,
      completedSteps: 1,
      status: "IN_PROGRESS" as const,
      steps: initial.steps.map((step, index) =>
        index === 0 ? { ...step, status: "COMPLETED" as const } : step,
      ),
      style: "Warm painted watercolour.",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ run: { id: "run-1", status: "RUNNING" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ project: completed }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectDetail project={initial} user={user} />);
    fireEvent.click(screen.getByRole("button", { name: /generate style/i }));

    await waitFor(() => {
      expect(screen.getByText("Warm painted watercolour.")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/steps/STYLE/run",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows a retry action for a failed step", () => {
    const project = projectFixture();
    project.steps[0] = {
      ...project.steps[0],
      run: {
        ...project.steps[0].run,
        attempt: 1,
        errorCode: "GEMINI_FAILED",
        errorMessage: "Gemini text generation failed.",
      },
      status: "FAILED",
    };

    render(<ProjectDetail project={project} user={user} />);

    expect(
      screen.getByText("Gemini text generation failed."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retry style/i }),
    ).toBeInTheDocument();
  });
});
