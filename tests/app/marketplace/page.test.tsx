import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get(name: string) {
      const cookie = document.cookie
        .split("; ")
        .find((entry) => entry.startsWith(`${name}=`));

      if (!cookie) {
        return undefined;
      }

      return {
        name,
        value: decodeURIComponent(cookie.slice(name.length + 1))
      };
    }
  }))
}));

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

function clearDocumentCookies() {
  document.cookie.split(";").forEach((cookie) => {
    const name = cookie.split("=")[0]?.trim();
    if (name) {
      document.cookie = `${name}=; Path=/; Max-Age=0`;
    }
  });
}

async function renderMarketplacePage() {
  const { default: MarketplacePage } = await import("@/app/marketplace/page");

  return render(await MarketplacePage());
}

describe("MarketplacePage", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearDocumentCookies();
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => makeCtxStub()
    ) as unknown as HTMLCanvasElement["getContext"];
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders the global compute monitor shell with live panels", async () => {
    await renderMarketplacePage();

    expect(
      screen.getByRole("heading", { name: /global compute monitor/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/demo · demo testnet/i)).toBeInTheDocument();
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

  it("shows cumulative live seller earnings instead of the seller task price", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (
        url.includes("/api/v1/dashboard/summary") &&
        url.includes("mode=live") &&
        url.includes("network=testnet")
      ) {
        return Response.json({
          metrics: {
            activeSellers: 1,
            openJobs: 0,
            completedJobs: 3,
            failedJobs: 0,
            volume24h: 0.003
          }
        });
      }

      if (
        url.includes("/api/v1/dashboard/market") &&
        url.includes("mode=live") &&
        url.includes("network=testnet")
      ) {
        return Response.json({
          rows: [
            {
              sellerId: "0x18dd91abcd318690",
              capability: "gpt-4o",
              pricePerTask: "0.0010",
              status: "idle",
              updatedAt: "2026-05-13T09:09:46.633Z",
              completedJobs24h: 3,
              totalEarned24h: "0.0030",
              latestJobAt: "2026-05-13T09:09:35.844Z"
            }
          ],
          topSellers: [
            {
              sellerId: "0x18dd91abcd318690",
              capability: "gpt-4o",
              status: "idle",
              completedJobs24h: 3,
              totalEarned24h: "0.0030",
              latestJobAt: "2026-05-13T09:09:35.844Z"
            }
          ],
          recentSettlements: [
            {
              id: "job-1",
              jobId: "job-1",
              sellerId: "0x18dd91abcd318690",
              capability: "gpt-4o",
              type: "released",
              amount: "0.0010",
              txHash: "0x525cad0000000def85",
              timestamp: "2026-05-13T09:09:46.376Z"
            }
          ]
        });
      }

      if (
        url.includes("/api/v1/dashboard/events") &&
        url.includes("mode=live") &&
        url.includes("network=testnet")
      ) {
        return Response.json({ items: [] });
      }

      return Response.json({});
    }) as typeof fetch;

    await renderMarketplacePage();

    fireEvent.click(screen.getByRole("button", { name: /live/i }));

    await waitFor(() => {
      expect(screen.getByText(/live · live testnet/i)).toBeInTheDocument();
      expect(screen.getByText("0.0030 USDT/USDC")).toBeInTheDocument();
    });

    expect(screen.getByText(/gpt-4o · 3 jobs settled/i)).toBeInTheDocument();
    expect(screen.getByText("+0.0010")).toBeInTheDocument();
  });

  it("lets Live Dashboard switch from testnet monitoring to mainnet monitoring", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/v1/dashboard/summary")) {
        return Response.json({
          metrics: {
            activeSellers: 0,
            openJobs: 0,
            completedJobs: 0,
            failedJobs: 0,
            volume24h: 0
          },
          activity24h: []
        });
      }

      if (url.includes("/api/v1/dashboard/market")) {
        return Response.json({
          rows: [],
          topSellers: [],
          recentSettlements: []
        });
      }

      if (url.includes("/api/v1/dashboard/events")) {
        return Response.json({ items: [] });
      }

      return Response.json({});
    }) as typeof fetch;

    await renderMarketplacePage();

    fireEvent.click(screen.getByRole("button", { name: /live/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("mode=live&network=testnet")
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /mainnet/i }));

    await waitFor(() => {
      expect(screen.getByText(/live · live mainnet/i)).toBeInTheDocument();
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("mode=live&network=mainnet")
      );
    });
  });

  it("places the one-click demo entry point under Live Testnet only", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/v1/dashboard/summary")) {
        return Response.json({
          metrics: {
            activeSellers: 0,
            openJobs: 0,
            completedJobs: 0,
            failedJobs: 0,
            volume24h: 0
          },
          activity24h: []
        });
      }

      if (url.includes("/api/v1/dashboard/market")) {
        return Response.json({
          rows: [],
          topSellers: [],
          recentSettlements: []
        });
      }

      if (url.includes("/api/v1/dashboard/events")) {
        return Response.json({ items: [] });
      }

      return Response.json({});
    }) as typeof fetch;

    await renderMarketplacePage();

    expect(screen.queryByRole("link", { name: /try it/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /live/i }));

    await waitFor(() => {
      expect(screen.getByText(/live · live testnet/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: /try it/i })).toHaveAttribute("href", "/demo");

    fireEvent.click(screen.getByRole("button", { name: /mainnet/i }));

    await waitFor(() => {
      expect(screen.getByText(/live · live mainnet/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole("link", { name: /try it/i })).not.toBeInTheDocument();
  });

  it("persists the selected Dashboard mode and live network across reloads", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/v1/dashboard/summary")) {
        return Response.json({
          metrics: {
            activeSellers: 0,
            openJobs: 0,
            completedJobs: 0,
            failedJobs: 0,
            volume24h: 0
          },
          activity24h: []
        });
      }

      if (url.includes("/api/v1/dashboard/market")) {
        return Response.json({
          rows: [],
          topSellers: [],
          recentSettlements: []
        });
      }

      if (url.includes("/api/v1/dashboard/events")) {
        return Response.json({ items: [] });
      }

      return Response.json({});
    }) as typeof fetch;

    const { unmount } = await renderMarketplacePage();

    fireEvent.click(screen.getByRole("button", { name: /live/i }));
    fireEvent.click(screen.getByRole("button", { name: /mainnet/i }));

    await waitFor(() => {
      expect(screen.getByText(/live · live mainnet/i)).toBeInTheDocument();
    });

    expect(document.cookie).toContain("quotadex_dashboard_mode=live");
    expect(document.cookie).toContain("quotadex_dashboard_live_network=mainnet");

    unmount();
    await renderMarketplacePage();

    await waitFor(() => {
      expect(screen.getByText(/live · live mainnet/i)).toBeInTheDocument();
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("mode=live&network=mainnet")
      );
    });
  });
});
