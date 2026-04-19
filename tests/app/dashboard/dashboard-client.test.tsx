import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardClient } from "@/app/dashboard/dashboard-client";

const originalFetch = global.fetch;

describe("DashboardClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it("loads live dashboard data when switching to real mode", async () => {
    vi.useRealTimers();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/v1/dashboard/summary")) {
        return new Response(
          JSON.stringify({
            metrics: {
              activeSellers: 9,
              openJobs: 2,
              completedJobs: 10,
              failedJobs: 1
            },
            sellerStatus: {
              idle: 4,
              reserved: 1,
              busy: 4,
              offline: 2
            },
            settlement: {
              primary: "Custom Escrow",
              fallback: "Mock",
              future: "Pieverse Facilitator"
            },
            updatedAt: "2026-04-19T09:00:00.000Z"
          })
        );
      }

      if (url.includes("/api/v1/dashboard/market")) {
        return new Response(
          JSON.stringify({
            rows: [
              {
                sellerId: "seller-live-1",
                capability: "Llama-3 8B",
                pricePerTask: "0.002",
                status: "idle",
                updatedAt: "2026-04-19T09:00:00.000Z"
              }
            ]
          })
        );
      }

      if (url.includes("/api/v1/dashboard/events")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "evt-live-1",
                jobId: "job-live-1",
                type: "DONE",
                title: "Execution completed",
                message: "Job settled via Gateway.",
                tone: "positive",
                timestamp: "2026-04-19T09:00:00.000Z"
              }
            ]
          })
        );
      }

      throw new Error(`Unhandled fetch URL: ${url}`);
    });

    global.fetch = fetchMock as typeof fetch;

    render(<DashboardClient />);

    fireEvent.click(screen.getByRole("button", { name: /real mode/i }));

    expect(await screen.findByText("seller-live-1")).toBeInTheDocument();
    expect(screen.getByText(/execution completed/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("runs the demo action flow locally without calling the gateway", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;

    render(<DashboardClient />);

    fireEvent.click(screen.getByRole("button", { name: /start demo flow/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4200);
    });

    expect(
      screen.getByText(/synthetic execution complete\. demo mode generated/i)
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
