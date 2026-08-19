import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("foundation app shell", () => {
  it("shows the studio title and the five-step contract", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Give a story a visual world." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Style")).toBeInTheDocument();
    expect(screen.getByText("Illustrations")).toBeInTheDocument();
  });
});
