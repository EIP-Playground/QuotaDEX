import { createServerSupabaseClient } from "@/lib/supabase";
import { GET } from "@/app/api/v1/dashboard/summary/route";
import { afterEach, beforeEach } from "vitest";

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

type MockTable = "sellers" | "jobs" | "events";

function createMockSupabase(rows: Record<MockTable, unknown[]>) {
  const filters: Array<{ table: MockTable; column: string; values: string[] }> = [];
  const selects: Array<{ table: MockTable; columns: string }> = [];

  return {
    filters,
    selects,
    from(table: MockTable) {
      const query = {
        select(columns: string) {
          selects.push({ table, columns });
          return query;
        },
        in(column: string, values: string[]) {
          filters.push({ table, column, values });
          return query;
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve({
            data: rows[table],
            error: null
          }).then(resolve);
        }
      };

      return query;
    }
  };
}

describe("GET /api/v1/dashboard/summary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns KPI rollups and current payment route narrative", async () => {
    const supabase = createMockSupabase({
        sellers: [
          { status: "idle" },
          { status: "busy" },
          { status: "reserved" },
          { status: "offline" }
        ],
        jobs: [
          {
            id: "job-settling",
            status: "settling",
            payment_status: "settling",
            amount: "0.0010",
            created_at: "2026-05-13T09:30:00.000Z"
          },
          { status: "paid" },
          { status: "running" },
          {
            id: "job-1",
            status: "done",
            payment_status: "released",
            amount: "0.0010",
            created_at: "2026-05-13T09:00:00.000Z"
          },
          {
            id: "job-failed",
            status: "failed",
            payment_status: "refunded",
            amount: "0.0020",
            created_at: "2026-05-13T08:30:00.000Z"
          },
          {
            id: "job-2",
            status: "done",
            payment_status: "released",
            amount: 0.002,
            created_at: "2026-05-13T08:00:00.000Z"
          },
          {
            id: "job-old",
            status: "done",
            payment_status: "released",
            amount: "0.0100",
            created_at: "2026-05-11T08:00:00.000Z"
          }
        ],
        events: [
          {
            job_id: "job-1",
            type: "RELEASED",
            timestamp: "2026-05-13T09:10:00.000Z"
          },
          {
            job_id: "job-2",
            type: "DEMO_DONE",
            timestamp: "2026-05-13T08:15:00.000Z"
          },
          {
            job_id: "job-old",
            type: "RELEASED",
            timestamp: "2026-05-11T09:00:00.000Z"
          },
          { job_id: null, type: "SELLER_ONLINE", timestamp: "2026-04-19T08:00:00.000Z" }
        ]
      });
    vi.mocked(createServerSupabaseClient).mockReturnValue(supabase as never);

    const response = await GET(
      new Request("https://quotadex.test/api/v1/dashboard/summary?mode=live&network=mainnet")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(supabase.filters).toEqual([
      { table: "sellers", column: "network_profile", values: ["live-mainnet"] },
      { table: "jobs", column: "network_profile", values: ["live-mainnet"] },
      { table: "events", column: "network_profile", values: ["live-mainnet"] }
    ]);
    expect(supabase.selects).toContainEqual({
      table: "jobs",
      columns: "id, status, payment_status, amount, created_at"
    });
    expect(payload.activity24h).toHaveLength(24);
    expect(
      payload.activity24h.find((bucket: { hour: string }) => bucket.hour === "2026-05-13T08:00:00.000Z")
    ).toEqual({
      hour: "2026-05-13T08:00:00.000Z",
      createdJobs: 2,
      settledJobs: 1
    });
    expect(
      payload.activity24h.find((bucket: { hour: string }) => bucket.hour === "2026-05-13T09:00:00.000Z")
    ).toEqual({
      hour: "2026-05-13T09:00:00.000Z",
      createdJobs: 2,
      settledJobs: 1
    });
    expect(payload).toEqual({
      metrics: {
        activeSellers: 3,
        openJobs: 3,
        completedJobs: 3,
        failedJobs: 1,
        volume24h: 0.003
      },
      sellerStatus: {
        idle: 1,
        reserved: 1,
        busy: 1,
        offline: 1
      },
      settlement: {
        primary: "Kite x402 Escrow",
        fallback: "Mock fallback only",
        future: "Profile-based Live Mainnet switch"
      },
      updatedAt: "2026-05-13T09:10:00.000Z",
      activity24h: payload.activity24h
    });
  });
});
