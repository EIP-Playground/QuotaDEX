import { createServerSupabaseClient } from "@/lib/supabase";
import { createSellerSessionToken } from "@/lib/seller-session";
import { POST as heartbeatSeller } from "@/app/api/v1/sellers/heartbeat/route";
import { POST as registerSeller } from "@/app/api/v1/sellers/register/route";

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

describe("seller lifecycle routes", () => {
  const sellerId = "0x5555555555555555555555555555555555555555";
  const eventInsert = vi.fn();
  const sellerUpsert = vi.fn();
  const sellerUpdate = vi.fn();
  const sellerReadMaybeSingle = vi.fn();
  const sellerUpdateEq = vi.fn((): unknown => ({
    select: () => ({ maybeSingle: vi.fn() })
  }));
  const sellerSelectEq = vi.fn(() => ({ maybeSingle: sellerReadMaybeSingle }));
  const sellerSelect = vi.fn(() => ({ eq: sellerSelectEq }));
  const from = vi.fn((table: string) => {
    if (table === "events") {
      return { insert: eventInsert };
    }

    return {
      upsert: sellerUpsert,
      select: sellerSelect,
      update: sellerUpdate
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.GATEWAY_SALT = "seller-session-secret";

    eventInsert.mockResolvedValue({ error: null });
    sellerUpsert.mockResolvedValue({ error: null });
    sellerReadMaybeSingle.mockResolvedValue({
      data: {
        id: sellerId,
        status: "offline"
      },
      error: null
    });
    sellerUpdate.mockReturnValue({ eq: sellerUpdateEq });
    sellerUpdateEq.mockReturnValue({ error: null });

    vi.mocked(createServerSupabaseClient).mockReturnValue({ from } as never);
  });

  it("registers a seller profile as offline until the worker heartbeats", async () => {
    const response = await registerSeller(
      new Request("https://quotadex.test/api/v1/sellers/register", {
        method: "POST",
        body: JSON.stringify({
          seller_id: sellerId,
          wallet: sellerId,
          passport_payer_addr: sellerId,
          passport_agent_id: "agent-seller-1",
          capability: "llama-3",
          price_per_task: "0.001"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("registered");
    expect(sellerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: sellerId,
        status: "offline",
        last_heartbeat_at: null
      }),
      { onConflict: "id" }
    );
    expect(eventInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SELLER_REGISTERED"
      })
    );
  });

  it("rejects heartbeat without a Gateway seller session", async () => {
    const response = await heartbeatSeller(
      new Request("https://quotadex.test/api/v1/sellers/heartbeat", {
        method: "POST",
        body: JSON.stringify({
          seller_id: sellerId,
          passport_payer_addr: sellerId,
          passport_agent_id: "agent-seller-1"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("SELLER_SESSION_INVALID");
    expect(sellerUpdate).not.toHaveBeenCalled();
  });

  it("marks an offline seller idle when it sends an authenticated heartbeat", async () => {
    const token = await createSellerSessionToken(
      {
        sellerId,
        passportAgentId: "agent-seller-1",
        passportSubject: "user_123"
      },
      "seller-session-secret"
    );
    const response = await heartbeatSeller(
      new Request("https://quotadex.test/api/v1/sellers/heartbeat", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          seller_id: sellerId,
          passport_payer_addr: sellerId,
          passport_agent_id: "agent-seller-1"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      seller_id: sellerId,
      seller_status: "idle"
    });
    expect(sellerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "idle",
        passport_agent_id: "agent-seller-1",
        passport_payer_addr: sellerId,
        last_heartbeat_at: expect.any(String)
      })
    );
  });
});
