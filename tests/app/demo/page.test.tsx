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

describe("DemoPage", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => makeCtxStub()
    ) as unknown as HTMLCanvasElement["getContext"];
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it("renders the on-chain Kite Testnet happy path demo shell", async () => {
    const { default: DemoPage } = await import("@/app/demo/page");
    render(<DemoPage />);

    expect(screen.getByText(/a2a demo · kite testnet/i)).toBeInTheDocument();
    expect(screen.getByText(/kite testnet usdt/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start demo/i })).toBeInTheDocument();
    expect(screen.queryByText(/mock fallback/i)).not.toBeInTheDocument();
  });
});
