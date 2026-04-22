import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const makeCtxStub = () =>
  ({
    clearRect: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    fillText: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
    font: "",
    textAlign: "",
    textBaseline: ""
  }) as unknown as CanvasRenderingContext2D;

async function renderHomePage() {
  const { default: HomePage } = await import("@/app/page");
  return render(<HomePage />);
}

describe("HomePage", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => makeCtxStub()
    ) as unknown as HTMLCanvasElement["getContext"];
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it("renders the landing hero, features, and timeline", async () => {
    await renderHomePage();

    const logos = screen.getAllByAltText(/quotadex logo/i);

    expect(
      screen.getByRole("heading", {
        name: /the first decentralized ai compute marketplace/i
      })
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /become a seller/i })).toHaveAttribute(
      "href",
      "/marketplace"
    );
    expect(screen.getByRole("link", { name: /find a compute/i })).toHaveAttribute(
      "href",
      "/marketplace"
    );

    expect(
      screen.getByRole("heading", { name: /idle compute to revenue/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /global a2a network/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /instant micro-payments/i })
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: /quote \[ & verify \]/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /escrow \[ on kite \]/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /agent \[ network \]/i })
    ).toBeInTheDocument();

    expect(logos).toHaveLength(2);
    logos.forEach((logo) => {
      expect(logo).toHaveAttribute("src", expect.stringContaining("QuotaDEX-logo.png"));
    });

    expect(screen.getByText(/idle ai compute finally has a market/i)).toBeInTheDocument();
    expect(screen.getByText(/© 2026 quotadex/i)).toBeInTheDocument();
  });
});
