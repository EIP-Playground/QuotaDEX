import { createServerSupabaseClient } from "@/lib/supabase";
import { GET } from "@/app/api/v1/dashboard/market/route";

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

function createMockSupabase(sellers: unknown[]) {
  return {
    from() {
      return {
        async select() {
          return {
            data: sellers,
            error: null
          };
        }
      };
    }
  };
}

describe("GET /api/v1/dashboard/market", () => {
  it("returns seller rows for the live market table ordered by freshest update", async () => {
    vi.mocked(createServerSupabaseClient).mockReturnValue(
      createMockSupabase([
        {
          id: "seller-older",
          capability: "llama-3 8b",
          price_per_task: "0.0045",
          status: "busy",
          updated_at: "2026-04-19T06:10:00.000Z"
        },
        {
          id: "seller-newer",
          capability: "mistral 7b",
          price_per_task: "0.0030",
          status: "idle",
          updated_at: "2026-04-19T08:10:00.000Z"
        }
      ]) as never
    );

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows).toEqual([
      {
        sellerId: "seller-newer",
        capability: "mistral 7b",
        pricePerTask: "0.0030",
        status: "idle",
        updatedAt: "2026-04-19T08:10:00.000Z"
      },
      {
        sellerId: "seller-older",
        capability: "llama-3 8b",
        pricePerTask: "0.0045",
        status: "busy",
        updatedAt: "2026-04-19T06:10:00.000Z"
      }
    ]);
  });
});
