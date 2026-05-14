import { createServerSupabaseClient } from "@/lib/supabase";
import { GET } from "@/app/api/v1/dashboard/events/route";

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

function createMockSupabase(events: unknown[]) {
  const filters: Array<{ column: string; values: string[] }> = [];

  return {
    filters,
    from() {
      const query = {
        select() {
          return query;
        },
        in(column: string, values: string[]) {
          filters.push({ column, values });
          return query;
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve({
            data: events,
            error: null
          }).then(resolve);
        }
      };

      return query;
    }
  };
}

describe("GET /api/v1/dashboard/events", () => {
  it("maps recent backend events into dashboard feed items", async () => {
    const supabase = createMockSupabase([
        {
          id: "event-1",
          job_id: "job-1",
          type: "DONE",
          message: "Seller seller-1 completed job job-1.",
          timestamp: "2026-04-19T09:00:00.000Z"
        },
        {
          id: "event-2",
          job_id: null,
          type: "SELLER_ONLINE",
          message: "Seller seller-2 is online with capability llama-3.",
          timestamp: "2026-04-19T08:00:00.000Z"
        }
      ]);
    vi.mocked(createServerSupabaseClient).mockReturnValue(supabase as never);

    const response = await GET(
      new Request("https://quotadex.test/api/v1/dashboard/events?mode=live&network=mainnet")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(supabase.filters).toEqual([
      { column: "network_profile", values: ["live-mainnet"] }
    ]);
    expect(payload.items).toEqual([
      {
        id: "event-1",
        jobId: "job-1",
        type: "DONE",
        title: "Execution completed",
        message: "Seller seller-1 completed job job-1.",
        timestamp: "2026-04-19T09:00:00.000Z",
        tone: "positive"
      },
      {
        id: "event-2",
        jobId: null,
        type: "SELLER_ONLINE",
        title: "Seller online",
        message: "Seller seller-2 is online with capability llama-3.",
        timestamp: "2026-04-19T08:00:00.000Z",
        tone: "neutral"
      }
    ]);
  });
});
