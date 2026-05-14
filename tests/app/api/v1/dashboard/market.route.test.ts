import { createServerSupabaseClient } from "@/lib/supabase";
import { GET } from "@/app/api/v1/dashboard/market/route";
import { afterEach, beforeEach } from "vitest";

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

type MockTable = "sellers" | "jobs" | "events";

function createMockSupabase(rows: Record<MockTable, unknown[]>) {
  const filters: Array<{ table: MockTable; column: string; values: string[] }> = [];

  return {
    filters,
    from(table: MockTable) {
      const query = {
        select() {
          return query;
        },
        in(column: string, values: string[]) {
          filters.push({ table, column, values });
          return query;
        },
        gte() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return Promise.resolve({
            data: rows[table],
            error: null
          });
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

describe("GET /api/v1/dashboard/market", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns live market rows plus seller earnings and recent settlements from jobs", async () => {
    const supabase = createMockSupabase({
        sellers: [
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
            price_per_task: "0.0010",
            status: "idle",
            updated_at: "2026-04-19T08:10:00.000Z"
          }
        ],
        jobs: [
          {
            id: "job-1",
            seller_id: "seller-newer",
            status: "done",
            payment_status: "released",
            amount: "0.0010",
            created_at: "2026-05-13T09:00:00.000Z",
            release_tx_hash: "0xrelease1",
            refund_tx_hash: null,
            settlement_tx_hash: "0xsettle1"
          },
          {
            id: "job-2",
            seller_id: "seller-newer",
            status: "done",
            payment_status: "released",
            amount: "0.0010",
            created_at: "2026-05-13T08:00:00.000Z",
            release_tx_hash: "0xrelease2",
            refund_tx_hash: null,
            settlement_tx_hash: "0xsettle2"
          },
          {
            id: "job-3",
            seller_id: "seller-newer",
            status: "done",
            payment_status: "released",
            amount: 0.001,
            created_at: "2026-05-11T07:00:00.000Z",
            release_tx_hash: "0xrelease3",
            refund_tx_hash: null,
            settlement_tx_hash: "0xsettle3"
          },
          {
            id: "job-4",
            seller_id: "seller-older",
            status: "done",
            payment_status: "released",
            amount: "0.0020",
            created_at: "2026-05-13T06:00:00.000Z",
            release_tx_hash: "0xrelease4",
            refund_tx_hash: null,
            settlement_tx_hash: "0xsettle4"
          },
          {
            id: "job-old",
            seller_id: "seller-newer",
            status: "done",
            payment_status: "released",
            amount: "0.5000",
            created_at: "2026-05-11T06:00:00.000Z",
            release_tx_hash: "0xoldrelease",
            refund_tx_hash: null,
            settlement_tx_hash: "0xoldsettle"
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
            type: "RELEASED",
            timestamp: "2026-05-13T08:10:00.000Z"
          },
          {
            job_id: "job-3",
            type: "DEMO_DONE",
            timestamp: "2026-05-13T07:10:00.000Z"
          },
          {
            job_id: "job-4",
            type: "RELEASED",
            timestamp: "2026-05-13T06:10:00.000Z"
          },
          {
            job_id: "job-old",
            type: "RELEASED",
            timestamp: "2026-05-11T06:10:00.000Z"
          }
        ]
      });
    vi.mocked(createServerSupabaseClient).mockReturnValue(supabase as never);

    const response = await GET(
      new Request("https://quotadex.test/api/v1/dashboard/market?mode=live&network=testnet")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(supabase.filters).toEqual(
      expect.arrayContaining([
        {
          table: "sellers",
          column: "network_profile",
          values: ["demo-testnet", "live-testnet"]
        },
        {
          table: "events",
          column: "network_profile",
          values: ["demo-testnet", "live-testnet"]
        },
        {
          table: "jobs",
          column: "network_profile",
          values: ["demo-testnet", "live-testnet"]
        }
      ])
    );
    expect(payload.rows).toEqual([
      {
        sellerId: "seller-newer",
        capability: "mistral 7b",
        pricePerTask: "0.0010",
        status: "idle",
        updatedAt: "2026-04-19T08:10:00.000Z",
        completedJobs24h: 3,
        totalEarned24h: "0.0030",
        latestJobAt: "2026-05-13T09:10:00.000Z"
      },
      {
        sellerId: "seller-older",
        capability: "llama-3 8b",
        pricePerTask: "0.0045",
        status: "busy",
        updatedAt: "2026-04-19T06:10:00.000Z",
        completedJobs24h: 1,
        totalEarned24h: "0.0020",
        latestJobAt: "2026-05-13T06:10:00.000Z"
      }
    ]);
    expect(payload.topSellers).toEqual([
      {
        sellerId: "seller-newer",
        capability: "mistral 7b",
        status: "idle",
        completedJobs24h: 3,
        totalEarned24h: "0.0030",
        latestJobAt: "2026-05-13T09:10:00.000Z"
      },
      {
        sellerId: "seller-older",
        capability: "llama-3 8b",
        status: "busy",
        completedJobs24h: 1,
        totalEarned24h: "0.0020",
        latestJobAt: "2026-05-13T06:10:00.000Z"
      }
    ]);
    expect(payload.recentSettlements.slice(0, 2)).toEqual([
      {
        id: "job-1",
        jobId: "job-1",
        sellerId: "seller-newer",
        capability: "mistral 7b",
        type: "released",
        amount: "0.0010",
        txHash: "0xrelease1",
        timestamp: "2026-05-13T09:10:00.000Z"
      },
      {
        id: "job-2",
        jobId: "job-2",
        sellerId: "seller-newer",
        capability: "mistral 7b",
        type: "released",
        amount: "0.0010",
        txHash: "0xrelease2",
        timestamp: "2026-05-13T08:10:00.000Z"
      }
    ]);
  });
});
