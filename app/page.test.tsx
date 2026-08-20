import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignOutButton } from "@/components/sign-out-button";
import { IdentityForm } from "@/components/identity-form";
import { ChapterList } from "@/components/chapter-list";
import { GenerationStatusFrame } from "@/components/generation-status-frame";
import { ProjectDetail } from "@/components/project-detail";
import { CharacterGrid } from "@/components/character-grid";
import type { GenerationRunView, ProjectDetailView } from "@/domain/project";
import type { AuthenticatedUser } from "@/server/auth";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
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
    chapters: [],
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

  it("opens the Portraits action after Characters without opening later steps", () => {
    const project = projectFixture();
    project.completedSteps = 2;
    project.status = "IN_PROGRESS";
    project.style = "Warm painted watercolour.";
    project.steps[0] = { ...project.steps[0], status: "COMPLETED" };
    project.steps[1] = { ...project.steps[1], status: "COMPLETED" };

    render(<ProjectDetail project={project} user={user} />);

    expect(
      screen.getByRole("button", { name: /generate portraits/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Chapters").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
  });

  it("keeps generation history out of the project workspace", () => {
    const project = projectFixture();
    project.generationRuns = [
      { id: "run-current", isSelected: true } as GenerationRunView,
      { id: "run-previous", isSelected: false } as GenerationRunView,
    ];

    render(<ProjectDetail project={project} user={user} />);

    expect(screen.queryByText("Generation history")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use previous run" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Current generation run/i),
    ).not.toBeInTheDocument();
  });

  it("keeps saved output neutral when the server marks it read-only", () => {
    const project = projectFixture();
    project.selectedRunReadOnly = true;

    render(<ProjectDetail project={project} user={user} />);

    expect(screen.getByText("Saved results")).toBeInTheDocument();
    expect(
      screen.getByText("Results are ready to revisit."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/previous run|generation history/i),
    ).not.toBeInTheDocument();
  });

  it("renders a saved portrait beside a retryable partial failure", () => {
    render(
      <CharacterGrid
        characters={[
          {
            id: "character-1",
            name: "Mole",
            position: 0,
            prompt: "An adult mole portrait prompt.",
            portrait: {
              assetId: "asset-1",
              assetUrl: "/api/assets/asset-1",
              attempt: 1,
              claimedAt: "2026-01-01T00:00:00.000Z",
              errorCode: null,
              errorMessage: null,
              heartbeatAt: "2026-01-01T00:00:00.000Z",
              isStale: false,
              status: "COMPLETED",
            },
          },
          {
            id: "character-2",
            name: "Rat",
            position: 1,
            prompt: "An adult rat portrait prompt.",
            portrait: {
              assetId: null,
              assetUrl: null,
              attempt: 1,
              claimedAt: "2026-01-01T00:00:00.000Z",
              errorCode: "GEMINI_FAILED",
              errorMessage: "Mock image service rejected Rat.",
              heartbeatAt: "2026-01-01T00:00:00.000Z",
              isStale: false,
              status: "FAILED",
            },
          },
        ]}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByAltText("Portrait of Mole")).toBeInTheDocument();
    expect(screen.getByText("Portrait saved")).toHaveClass(
      "bg-orange",
      "text-white",
    );
    expect(
      screen.getByText("Mock image service rejected Rat."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry portrait" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 saved/)).toBeInTheDocument();
    expect(screen.getByAltText("Portrait of Mole")).toHaveAttribute(
      "src",
      "/api/assets/asset-1",
    );
  });

  it("disables portrait retries while another retry action is pending", () => {
    const retry = vi.fn();
    render(
      <CharacterGrid
        characters={[
          {
            id: "character-1",
            name: "Mole",
            position: 0,
            prompt: "An adult mole portrait prompt.",
            portrait: {
              assetId: null,
              assetUrl: null,
              attempt: 1,
              claimedAt: "2026-01-01T00:00:00.000Z",
              errorCode: "GEMINI_FAILED",
              errorMessage: "Mole failed.",
              heartbeatAt: "2026-01-01T00:00:00.000Z",
              isStale: false,
              status: "FAILED",
            },
          },
          {
            id: "character-2",
            name: "Rat",
            position: 1,
            prompt: "An adult rat portrait prompt.",
            portrait: {
              assetId: null,
              assetUrl: null,
              attempt: 1,
              claimedAt: "2026-01-01T00:00:00.000Z",
              errorCode: "GEMINI_FAILED",
              errorMessage: "Rat failed.",
              heartbeatAt: "2026-01-01T00:00:00.000Z",
              isStale: false,
              status: "FAILED",
            },
          },
        ]}
        onRetry={retry}
        retryDisabled
        retryingCharacterId="character-1"
      />,
    );

    expect(
      screen.getAllByRole("button", { name: /Retry portrait|Retrying/ }),
    ).toHaveLength(2);
    expect(
      screen
        .getAllByRole("button", { name: /Retry portrait|Retrying/ })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    expect(retry).not.toHaveBeenCalled();
  });

  it("renders private illustration assets without the Next image optimizer", () => {
    render(
      <ChapterList
        chapters={[
          {
            id: "chapter-1",
            name: "The River",
            position: 0,
            prompt: "A single river scene.",
            illustration: {
              assetId: "asset-illustration-1",
              assetUrl: "/api/assets/asset-illustration-1",
              attempt: 1,
              claimedAt: "2026-01-01T00:00:00.000Z",
              errorCode: null,
              errorMessage: null,
              heartbeatAt: "2026-01-01T00:00:00.000Z",
              isStale: false,
              status: "COMPLETED",
            },
          },
        ]}
      />,
    );

    expect(screen.getByAltText("Illustration for The River")).toHaveAttribute(
      "src",
      "/api/assets/asset-illustration-1",
    );
  });

  it("names running and stale recovery states in the step action panel", () => {
    const runningProject = projectFixture();
    runningProject.steps[0] = {
      ...runningProject.steps[0],
      run: {
        ...runningProject.steps[0].run,
        attempt: 1,
        claimedAt: "2026-01-01T00:00:00.000Z",
        heartbeatAt: "2026-01-01T00:00:00.000Z",
      },
      status: "RUNNING",
    };

    const { unmount } = render(
      <ProjectDetail project={runningProject} user={user} />,
    );
    expect(
      screen.getByText(/reading the book and defining an art style/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/results save as they finish/i),
    ).toBeInTheDocument();
    unmount();

    const staleProject = projectFixture();
    staleProject.steps[0] = {
      ...staleProject.steps[0],
      run: {
        ...staleProject.steps[0].run,
        attempt: 1,
        claimedAt: "2026-01-01T00:00:00.000Z",
        heartbeatAt: "2026-01-01T00:00:00.000Z",
        isStale: true,
      },
      status: "RUNNING",
    };

    render(<ProjectDetail project={staleProject} user={user} />);
    expect(
      screen.getByRole("button", { name: "Recover run" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /generation paused\. your saved work is safe/i,
    );
  });

  it("keeps the status frame structure consistent across recovery and completion", () => {
    const recover = vi.fn();
    const retry = vi.fn();

    const { rerender } = render(
      <GenerationStatusFrame
        action={{ label: "Recover run", onClick: recover }}
        eyebrow="RECOVERY"
        message="Generation paused. Your saved work is safe."
        meta="Ready to recover"
        progress="paused"
      />,
    );

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Recover run" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recover run" }));
    expect(recover).toHaveBeenCalledOnce();

    rerender(
      <GenerationStatusFrame
        action={{ label: "Retry portraits", onClick: retry }}
        eyebrow="RETRY"
        message="The image model timed out before this step finished."
        meta="Ready to retry"
        progress="failed"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Retry portraits" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    rerender(
      <GenerationStatusFrame
        detail="1 of 2 portraits saved"
        eyebrow="GENERATING"
        message="Finding adult characters and writing portrait prompts."
        meta="Elapsed 6s"
        progress="running"
      />,
    );

    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    rerender(
      <GenerationStatusFrame
        detail="Results are saved and ready to revisit."
        eyebrow="COMPLETE"
        message="All five steps are complete."
        meta="Saved"
        progress="complete"
      />,
    );

    expect(
      screen.getByText("All five steps are complete."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a failed illustration as retryable chapter progress", () => {
    render(
      <ChapterList
        chapters={[
          {
            id: "chapter-1",
            name: "The River",
            position: 0,
            prompt: "A single river scene.",
            illustration: {
              assetId: null,
              assetUrl: null,
              attempt: 1,
              claimedAt: "2026-01-01T00:00:00.000Z",
              errorCode: "GEMINI_FAILED",
              errorMessage: "The image model timed out.",
              heartbeatAt: "2026-01-01T00:00:00.000Z",
              isStale: false,
              status: "FAILED",
            },
          },
        ]}
      />,
    );

    expect(screen.getAllByText("Illustration failed")).toHaveLength(1);
    expect(screen.getByText("Needs retry")).toBeInTheDocument();
    expect(
      screen.getByText("0 of 1 saved · retry Illustrations above"),
    ).toBeInTheDocument();
    expect(screen.getByText("The image model timed out.")).toBeInTheDocument();
  });

  it("ignores an older polling response after a newer server view wins", async () => {
    vi.useFakeTimers();
    const initial = projectFixture();
    initial.steps[0] = {
      ...initial.steps[0],
      run: {
        ...initial.steps[0].run,
        attempt: 1,
        claimedAt: "2026-01-01T00:00:00.000Z",
        heartbeatAt: "2026-01-01T00:00:00.000Z",
      },
      status: "RUNNING",
    };
    const completed = {
      ...initial,
      completedSteps: 1,
      status: "IN_PROGRESS" as const,
      steps: initial.steps.map((step, index) =>
        index === 0 ? { ...step, status: "COMPLETED" as const } : step,
      ),
      style: "Warm painted watercolour.",
    };
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise((resolve) => {
      resolveSecond = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse)
      .mockImplementationOnce(() => secondResponse);
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectDetail project={initial} user={user} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSecond({
        ok: true,
        json: async () => ({ project: completed }),
      });
      await Promise.resolve();
    });
    expect(
      screen.getByRole("button", { name: /generate characters/i }),
    ).toBeInTheDocument();

    await act(async () => {
      resolveFirst({
        ok: true,
        json: async () => ({ project: initial }),
      });
      await Promise.resolve();
    });

    expect(
      screen.getByRole("button", { name: /generate characters/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /generate style/i }),
    ).not.toBeInTheDocument();
  });

  it("clears a transient refresh error after a later poll succeeds", async () => {
    vi.useFakeTimers();
    const initial = projectFixture();
    initial.steps[0] = {
      ...initial.steps[0],
      run: {
        ...initial.steps[0].run,
        attempt: 1,
        claimedAt: "2026-01-01T00:00:00.000Z",
        heartbeatAt: "2026-01-01T00:00:00.000Z",
      },
      status: "RUNNING",
    };
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
        ok: false,
        json: async () => ({ message: "Temporary refresh failure." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ project: completed }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectDetail project={initial} user={user} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Temporary refresh failure.",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /generate characters/i }),
    ).toBeInTheDocument();
  });

  it("keeps the completed state compact while retaining source access", () => {
    const project = projectFixture();
    project.completedSteps = 5;
    project.status = "DONE";
    project.steps = project.steps.map((step) => ({
      ...step,
      status: "COMPLETED" as const,
    }));

    render(<ProjectDetail project={project} user={user} />);

    expect(
      screen.getByText("All five steps are complete."),
    ).toBeInTheDocument();
    expect(screen.getByText("Done")).toHaveClass("bg-orange", "text-white");
    expect(
      screen
        .getAllByText("✓")
        .every((mark) => mark.classList.contains("bg-orange")),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Read full text" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Art style" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Book text" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Saved style")).not.toBeInTheDocument();
    expect(screen.queryByText("Book text preview")).not.toBeInTheDocument();
    expect(screen.queryByText("Full book text")).not.toBeInTheDocument();
  });

  it("opens the full book text in a dialog and returns focus on Escape", () => {
    const fullText =
      "A long river story begins here. The complete source remains available without occupying the primary workspace.";
    const project = { ...projectFixture(), bookText: fullText };

    render(<ProjectDetail project={project} user={user} />);
    const trigger = screen.getByRole("button", { name: "Read full text" });

    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Full book text" });
    expect(dialog).toHaveTextContent(fullText);
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("truncates long style context with an accessible details dialog", () => {
    const style = "Warm watercolor with layered ink texture. ".repeat(8);
    const project = { ...projectFixture(), style };

    render(<ProjectDetail project={project} user={user} />);
    const trigger = screen.getByRole("button", { name: "View full style" });

    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Saved art style" });
    expect(dialog).toHaveTextContent(style.trim());

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(trigger).toHaveFocus();
  });

  it("opens long prompts without changing the portrait frame or scrolling", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const prompt =
      "An adult mole portrait with detailed clothing, posture, warm light, and a consistent storybook palette. ".repeat(
        3,
      );

    const { unmount } = render(
      <CharacterGrid
        characters={[
          {
            id: "character-1",
            name: "Mole",
            position: 0,
            prompt,
            portrait: {
              assetId: null,
              assetUrl: null,
              attempt: 0,
              claimedAt: null,
              errorCode: null,
              errorMessage: null,
              heartbeatAt: null,
              isStale: false,
              status: "PENDING",
            },
          },
        ]}
      />,
    );

    const frame = screen.getByText("Queued").closest("div.relative");
    expect(frame).toHaveClass("w-full");
    expect(frame).not.toHaveClass("max-w-[320px]");
    expect(
      screen.getByText(/An adult mole portrait with detailed clothing/),
    ).toBeInTheDocument();
    const trigger = screen.getByRole("button", {
      name: "Read full prompt",
    });
    trigger.focus();
    fireEvent.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Mole portrait prompt" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent(prompt.trim());
    expect(scrollIntoView).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(trigger).toHaveFocus();
    unmount();
  });

  it("keeps image progress named and bounded while portraits run", () => {
    const project = projectFixture();
    project.completedSteps = 2;
    project.status = "IN_PROGRESS";
    project.steps[0] = { ...project.steps[0], status: "COMPLETED" };
    project.steps[1] = { ...project.steps[1], status: "COMPLETED" };
    project.steps[2] = {
      ...project.steps[2],
      run: {
        ...project.steps[2].run,
        attempt: 1,
        claimedAt: new Date(Date.now() - 5_000).toISOString(),
      },
      status: "RUNNING",
    };
    project.characters = [
      {
        id: "character-1",
        name: "Mole",
        position: 0,
        prompt: "An adult mole portrait prompt.",
        portrait: {
          assetId: "asset-1",
          assetUrl: "/api/assets/asset-1",
          attempt: 1,
          claimedAt: null,
          errorCode: null,
          errorMessage: null,
          heartbeatAt: null,
          isStale: false,
          status: "COMPLETED",
        },
      },
      {
        id: "character-2",
        name: "Rat",
        position: 1,
        prompt: "An adult rat portrait prompt.",
        portrait: {
          assetId: null,
          assetUrl: null,
          attempt: 1,
          claimedAt: null,
          errorCode: null,
          errorMessage: null,
          heartbeatAt: null,
          isStale: false,
          status: "RUNNING",
        },
      },
    ];

    render(<ProjectDetail project={project} user={user} />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(
      screen.getAllByText("1 of 2 portraits saved").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Elapsed \d+[sm]/)).toBeInTheDocument();
  });

  it("bounds chapter illustrations independently from their prompt", () => {
    render(
      <ChapterList
        chapters={[
          {
            id: "chapter-1",
            name: "The River",
            position: 0,
            prompt: "A single river scene.",
            illustration: {
              assetId: "asset-illustration-1",
              assetUrl: "/api/assets/asset-illustration-1",
              attempt: 1,
              claimedAt: "2026-01-01T00:00:00.000Z",
              errorCode: null,
              errorMessage: null,
              heartbeatAt: "2026-01-01T00:00:00.000Z",
              isStale: false,
              status: "COMPLETED",
            },
          },
        ]}
      />,
    );

    const image = screen.getByAltText("Illustration for The River");
    expect(image.parentElement).toHaveClass("w-full");
    expect(image.parentElement).not.toHaveClass("max-w-[608px]");
    expect(image.parentElement).not.toHaveClass("max-h-[380px]");
    expect(
      screen.getByRole("button", { name: "Read full prompt" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Illustration saved")).toHaveClass(
      "bg-orange",
      "text-white",
    );
    expect(screen.getByText("A single river scene.")).toBeInTheDocument();
  });
});
