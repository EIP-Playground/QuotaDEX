import React from "react";
import { render, screen } from "@testing-library/react";
import DashboardPage from "@/app/dashboard/page";

describe("DashboardPage", () => {
  it("renders the branded dashboard shell with mode controls", () => {
    render(<DashboardPage />);

    expect(
      screen.getByRole("heading", { name: /global compute monitor/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start selling compute/i })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    expect(screen.getByRole("button", { name: /demo mode/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /real mode/i })).toBeInTheDocument();
    expect(screen.getByText(/no live source yet/i)).toBeInTheDocument();
  });
});
