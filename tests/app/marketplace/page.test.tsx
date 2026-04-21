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

describe("MarketplacePage", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => makeCtxStub()
    ) as unknown as HTMLCanvasElement["getContext"];
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it("renders the global compute monitor shell with live panels", async () => {
    const { default: MarketplacePage } = await import("@/app/marketplace/page");
    render(<MarketplacePage />);

    expect(
      screen.getByRole("heading", { name: /global compute monitor/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/live · kite mainnet/i)).toBeInTheDocument();
    expect(screen.getByText(/active agents/i)).toBeInTheDocument();
    expect(screen.getByText(/24h volume/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /live market · order book/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /real-time transactions/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /network demand vs supply/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /recent escrow settlements/i })
    ).toBeInTheDocument();
  });
});
