import {
  listQuoteEligibleCapabilities,
  reserveSellerForQuote,
  setSellerIdleAfterExecution
} from "@/lib/jobs";
import { createServerSupabaseClient } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

describe("seller presence matching", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("aggregates capability-level inventory from quote-eligible sellers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T12:00:00.000Z"));

    const makeQuery = (pages: unknown[][]) => {
      const query = {
        eq: vi.fn(() => query),
        gte: vi.fn(() => query),
        lte: vi.fn(() => query),
        order: vi.fn(() => query),
        range: vi.fn(() => query),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => {
          const page = pages.shift() ?? [];
          return Promise.resolve({ data: page, error: null }).then(resolve);
        }
      };

      return query;
    };
    const idleQuery = makeQuery([
      Array.from({ length: 1000 }, () => ({
          capability: "deepseek-v4-pro",
          price_per_task: "0.02000000"
      })),
      [
        {
          capability: "gpt-4o",
          price_per_task: "0.00500000"
        }
      ]
    ]);
    const staleReservedQuery = makeQuery([
      [
        {
          capability: "deepseek-v4-pro",
          price_per_task: "0.01000000"
        }
      ],
      []
    ]);
    const queries = [idleQuery, staleReservedQuery];
    const select = vi.fn(() => queries.shift());

    vi.mocked(createServerSupabaseClient).mockReturnValue({
      from: vi.fn(() => ({ select }))
    } as never);

    await expect(listQuoteEligibleCapabilities("live-mainnet")).resolves.toEqual([
      {
        capability: "deepseek-v4-pro",
        available_count: 1001,
        min_price: "0.01000000"
      },
      {
        capability: "gpt-4o",
        available_count: 1,
        min_price: "0.00500000"
      }
    ]);

    expect(idleQuery.eq).toHaveBeenCalledWith("network_profile", "live-mainnet");
    expect(idleQuery.eq).toHaveBeenCalledWith("status", "idle");
    expect(idleQuery.gte).toHaveBeenCalledWith(
      "last_heartbeat_at",
      "2026-05-13T11:59:00.000Z"
    );
    expect(idleQuery.range).toHaveBeenCalledWith(0, 999);
    expect(idleQuery.range).toHaveBeenCalledWith(1000, 1999);
    expect(staleReservedQuery.eq).toHaveBeenCalledWith("network_profile", "live-mainnet");
    expect(staleReservedQuery.eq).toHaveBeenCalledWith("status", "reserved");
    expect(staleReservedQuery.lte).toHaveBeenCalledWith(
      "updated_at",
      "2026-05-13T11:59:30.000Z"
    );
    expect(staleReservedQuery.gte).toHaveBeenCalledWith(
      "last_heartbeat_at",
      "2026-05-13T11:59:00.000Z"
    );
    expect(staleReservedQuery.range).toHaveBeenCalledWith(0, 999);
    expect(idleQuery.limit).not.toHaveBeenCalled();
    expect(staleReservedQuery.limit).not.toHaveBeenCalled();
  });
});
