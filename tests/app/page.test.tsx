import React from "react";
import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders the Kite-style landing page with the core QuotaDEX brand sections", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: /the first decentralized ai compute marketplace/i
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    expect(screen.getByText(/custom escrow/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start selling compute/i })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    expect(
      screen.getByRole("heading", { name: /quotadex \[marketplace\]/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /quotadex \[escrow\]/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /quotadex \[monitor\]/i })).toBeInTheDocument();
  });
});
