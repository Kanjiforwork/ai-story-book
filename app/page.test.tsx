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

function generationRunFixture(
  input: Partial<GenerationRunView> & Pick<GenerationRunView, "id">,
): GenerationRunView {
  const { id, ...overrides } = input;
  return {
    completedAt: null,
    completedSteps: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    id,
    imageModelId: "gemini-test-image",
    isSelected: false,
    isWritable: false,
    promptVersion: "book-illustration-v1",
    sourceSnapshotHash: "source-hash",
    status: "COMPLETED",
    style: "Watercolor",
    styleRevision: "style-revision",
    textModelId: "gemini-test-text",
    totalSteps: 5,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
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

  it("selects a saved run without generation and renders it read-only", async () => {
    const currentRun = generationRunFixture({
      completedSteps: 1,
      id: "run-current",
      isSelected: true,
      isWritable: true,
      status: "ACTIVE",
      style: "Anime",
    });
    const previousRun = generationRunFixture({
      completedSteps: 2,
      id: "run-previous",
      style: "Watercolor",
    });
    const current = projectFixture();
    current.activeGenerationRunId = currentRun.id;
    current.completedSteps = 1;
    current.generationRuns = [currentRun, previousRun];
    current.selectedRunReadOnly = false;
    current.status = "IN_PROGRESS";
    current.style = currentRun.style;
    current.steps[0] = { ...current.steps[0], status: "COMPLETED" };
    const selectedPrevious = {
      ...current,
      activeGenerationRunId: previousRun.id,
      generationRuns: [
        { ...currentRun, isSelected: false, isWritable: false },
        { ...previousRun, isSelected: true },
      ],
      selectedRunReadOnly: true,
      style: previousRun.style,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ run: previousRun }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ project: selectedPrevious }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectDetail project={current} user={user} />);
    expect(
      screen.getByText("Selecting a run does not call Gemini"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use previous run" }));

    await waitFor(() => {
      expect(screen.getByText("Read-only history")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/generation-runs/run-previous/select",
      { method: "POST" },
    );
    expect(
      fetchMock.mock.calls.some(
        ([url]) =>
          String(url).includes("/steps/") ||
          String(url).includes("/generation"),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/steps/")),
    ).toBe(false);
  });

  it("does not expose retry actions for failed output in read-only history", () => {
    const project = projectFixture();
    project.activeGenerationRunId = "run-previous";
    project.generationRuns = [
      generationRunFixture({
        id: "run-previous",
        isSelected: true,
        style: "Watercolor",
      }),
    ];
    project.selectedRunReadOnly = true;
    project.style = "Watercolor";
    project.characters = [
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
          errorMessage: "Portrait generation failed.",
          heartbeatAt: "2026-01-01T00:00:00.000Z",
          isStale: false,
          status: "FAILED",
        },
      },
    ];
    project.chapters = [
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
          errorMessage: "Illustration generation failed.",
          heartbeatAt: "2026-01-01T00:00:00.000Z",
          isStale: false,
          status: "FAILED",
        },
      },
    ];

    render(<ProjectDetail project={project} user={user} />);

    expect(screen.getByText("Read-only history")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry portrait" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/retry Illustrations above/i),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/read-only history/i).length).toBeGreaterThan(0);
  });

  it("uses read-only recovery copy for stale history output", () => {
    const project = projectFixture();
    project.activeGenerationRunId = "run-previous";
    project.generationRuns = [
      generationRunFixture({
        id: "run-previous",
        isSelected: true,
        style: "Watercolor",
      }),
    ];
    project.selectedRunReadOnly = true;
    project.style = "Watercolor";
    project.characters = [
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
          errorCode: "STALE_RUN",
          errorMessage: null,
          heartbeatAt: "2026-01-01T00:00:00.000Z",
          isStale: true,
          status: "RUNNING",
        },
      },
    ];
    project.chapters = [
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
          errorMessage: null,
          heartbeatAt: "2026-01-01T00:00:00.000Z",
          isStale: false,
          status: "FAILED",
        },
      },
    ];

    render(<ProjectDetail project={project} user={user} />);

    expect(
      screen.queryByText(/Recover the Portraits run above/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Retry Illustrations above/i),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/start a new generation run/i).length).toBe(3);
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
      screen.getByRole("heading", {
        name: /reading the book and defining an art style/i,
      }),
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
      /recover it to continue; saved work is safe/i,
    );
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

    expect(screen.getAllByText("Illustration failed")).toHaveLength(2);
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
    expect(
      screen.getByRole("button", { name: "Read full text" }),
    ).toBeInTheDocument();
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

  it("opens long prompts without changing the portrait frame or scrolling", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const prompt =
      "An adult mole portrait with detailed clothing, posture, warm light, and a consistent storybook palette.";

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

    const frame = screen
      .getAllByText("Portrait pending")[0]
      .closest("div.relative");
    expect(frame).toHaveClass("max-w-[320px]");
    const trigger = screen.getByRole("button", {
      name: "View portrait prompt",
    });
    trigger.focus();
    fireEvent.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Mole portrait prompt" }),
    ).toBeInTheDocument();
    expect(screen.getByText(prompt)).toBeInTheDocument();
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
    expect(image.parentElement).toHaveClass("max-w-[608px]");
    expect(
      screen.getByRole("button", { name: "View illustration prompt" }),
    ).toBeInTheDocument();
  });
});
