import { reserveSellerForQuote, setSellerIdleAfterExecution } from "@/lib/jobs";
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

    await expect(reserveSellerForQuote("llama-3", "live-mainnet")).resolves.toBeNull();
    expect(query.eq).toHaveBeenCalledWith("network_profile", "live-mainnet");

    expect(query.gte).toHaveBeenCalledWith(
      "last_heartbeat_at",
      "2026-05-13T11:59:00.000Z"
    );

    vi.useRealTimers();
  });

  it("releases only the seller row for the selected network profile", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "0x5555555555555555555555555555555555555555" },
      error: null
    });
    const query = {
      eq: vi.fn(() => query),
      select: vi.fn(() => ({
        maybeSingle
      }))
    };
    const update = vi.fn(() => query);

    vi.mocked(createServerSupabaseClient).mockReturnValue({
      from: vi.fn(() => ({ update }))
    } as never);

    await expect(
      setSellerIdleAfterExecution(
        "0x5555555555555555555555555555555555555555",
        "live-mainnet"
      )
    ).resolves.toBe(true);

    expect(query.eq).toHaveBeenCalledWith(
      "id",
      "0x5555555555555555555555555555555555555555"
    );
    expect(query.eq).toHaveBeenCalledWith("network_profile", "live-mainnet");
    expect(query.eq).toHaveBeenCalledWith("status", "busy");
  });
});
