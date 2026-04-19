import { createServerSupabaseClient } from "@/lib/supabase";
import { GET } from "@/app/api/v1/dashboard/summary/route";

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

type MockTable = "sellers" | "jobs" | "events";

function createMockSupabase(rows: Record<MockTable, unknown[]>) {
  return {
    from(table: MockTable) {
      return {
        async select() {
          return {
            data: rows[table],
            error: null
          };
        }
      };
    }
  };
}

describe("GET /api/v1/dashboard/summary", () => {
  it("returns KPI rollups and current payment route narrative", async () => {
    vi.mocked(createServerSupabaseClient).mockReturnValue(
      createMockSupabase({
        sellers: [
          { status: "idle" },
          { status: "busy" },
          { status: "reserved" },
          { status: "offline" }
        ],
        jobs: [
          { status: "paid" },
          { status: "running" },
          { status: "done" },
          { status: "failed" },
          { status: "done" }
        ],
        events: [{ timestamp: "2026-04-19T08:00:00.000Z" }]
      }) as never
    );

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      metrics: {
        activeSellers: 3,
        openJobs: 2,
        completedJobs: 2,
        failedJobs: 1
      },
      sellerStatus: {
        idle: 1,
        reserved: 1,
        busy: 1,
        offline: 1
      },
      settlement: {
        primary: "Custom Escrow",
        fallback: "Mock",
        future: "Pieverse Facilitator"
      },
      updatedAt: "2026-04-19T08:00:00.000Z"
    });
  });
});
