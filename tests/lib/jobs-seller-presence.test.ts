import { reserveSellerForQuote } from "@/lib/jobs";
import { createServerSupabaseClient } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

describe("seller presence matching", () => {
  it("only considers idle or stale-reserved sellers with a recent heartbeat", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T12:00:00.000Z"));

    const query = {
      eq: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
      order: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null })
    };
    query.eq.mockReturnValue(query);
    query.gte.mockReturnValue(query);
    query.lte.mockReturnValue(query);
    query.order.mockReturnValue(query);
    const select = vi.fn(() => query);

    vi.mocked(createServerSupabaseClient).mockReturnValue({
      from: vi.fn(() => ({ select }))
    } as never);

    await expect(reserveSellerForQuote("llama-3")).resolves.toBeNull();

    expect(query.gte).toHaveBeenCalledWith(
      "last_heartbeat_at",
      "2026-05-13T11:59:00.000Z"
    );

    vi.useRealTimers();
  });
});
