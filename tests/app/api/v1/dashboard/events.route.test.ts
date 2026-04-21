import { createServerSupabaseClient } from "@/lib/supabase";
import { GET } from "@/app/api/v1/dashboard/events/route";

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

function createMockSupabase(events: unknown[]) {
  return {
    from() {
      return {
        async select() {
          return {
            data: events,
            error: null
          };
        }
      };
    }
  };
}

describe("GET /api/v1/dashboard/events", () => {
  it("maps recent backend events into dashboard feed items", async () => {
    vi.mocked(createServerSupabaseClient).mockReturnValue(
      createMockSupabase([
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
      ]) as never
    );

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
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
