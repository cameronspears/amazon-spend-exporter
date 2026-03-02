// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { ResultsPage } from "../ResultsPage";

function renderDemoResults(): void {
  render(
    <MemoryRouter initialEntries={["/results/demo"]}>
      <Routes>
        <Route path="/results/:runId" element={<ResultsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ResultsPage insights dashboard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders simplified navigation and overview metrics", () => {
    renderDemoResults();

    const nav = screen.getByRole("navigation", { name: "Insights sections" });
    expect(within(nav).getByRole("link", { name: "Overview" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Shipping & Tax" })).toBeTruthy();

    expect(screen.getByText("Total Spend")).toBeTruthy();
    expect(screen.getByText("Average Order Value")).toBeTruthy();
    expect(screen.getByText("Most Expensive Item")).toBeTruthy();
    expect(screen.queryByText("P90 Order Value")).toBeNull();
    expect(screen.queryByText("Repeat Item Rate")).toBeNull();
    expect(screen.queryByText("Estimated Merchandise")).toBeNull();
  });

  it("updates month drilldown when clicking a month bar", async () => {
    const user = userEvent.setup();
    renderDemoResults();

    const julyButton = screen.getAllByRole("button", { name: /2025-07/ })[0];
    const decemberButton = screen.getAllByRole("button", { name: /2025-12/ })[0];

    expect(julyButton.getAttribute("aria-pressed")).toBe("true");
    await user.click(decemberButton);

    expect(decemberButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Order 112-2246180-2507406")).toBeTruthy();
  });
});
