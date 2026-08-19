import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IdentityForm } from "@/components/identity-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe("foundation app shell", () => {
  it("shows the studio title and the five-step contract", () => {
    render(<IdentityForm />);

    expect(
      screen.getByRole("heading", { name: "Welcome to the studio" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});
