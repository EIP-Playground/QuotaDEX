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
  const sellerInsert = vi.fn();
  const sellerReadMaybeSingle = vi.fn();
  const sellerUpdateMaybeSingle = vi.fn();
  const sellerUpdateSelect = vi.fn(() => ({
    maybeSingle: sellerUpdateMaybeSingle
  }));
  const sellerUpdateIs = vi.fn(() => ({
    select: sellerUpdateSelect
  }));
  const sellerUpdateEqUpdatedAt = vi.fn(() => ({
    select: sellerUpdateSelect
  }));
  const sellerUpdateEqStatus = vi.fn(() => ({
    eq: sellerUpdateEqUpdatedAt
  }));
  const sellerUpdateEq = vi.fn((): unknown => ({
    is: sellerUpdateIs,
    eq: sellerUpdateEqStatus,
    select: sellerUpdateSelect,
    error: null
  }));
  const sellerSelectEq = vi.fn(() => ({ maybeSingle: sellerReadMaybeSingle }));
  const sellerSelect = vi.fn(() => ({ eq: sellerSelectEq }));
  const from = vi.fn((table: string) => {
    if (table === "events") {
      return { insert: eventInsert };
    }

    return {
      upsert: sellerUpsert,
      insert: sellerInsert,
      select: sellerSelect,
      update: sellerUpdate
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.GATEWAY_SALT = "seller-session-secret";

    eventInsert.mockResolvedValue({ error: null });
    sellerUpsert.mockResolvedValue({ error: null });
    sellerInsert.mockResolvedValue({ error: null });
    sellerReadMaybeSingle.mockResolvedValue({
      data: {
        id: sellerId,
        status: "offline",
        updated_at: "2026-05-13T10:00:00.000Z"
      },
      error: null
    });
    sellerUpdateMaybeSingle.mockResolvedValue({
      data: {
        id: sellerId,
        status: "idle"
      },
      error: null
    });
    sellerUpdate.mockReturnValue({ eq: sellerUpdateEq });

    vi.mocked(createServerSupabaseClient).mockReturnValue({ from } as never);
  });

  it("registers a seller profile as offline until the worker heartbeats", async () => {
    sellerReadMaybeSingle.mockResolvedValue({
      data: null,
      error: null
    });
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
    expect(sellerInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: sellerId,
        passport_agent_id: null,
        status: "offline",
        last_heartbeat_at: null
      })
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
    expect(sellerUpdateEq).toHaveBeenCalledWith("id", sellerId);
    expect(sellerUpdateEqStatus).toHaveBeenCalledWith("status", "offline");
    expect(sellerUpdateEqUpdatedAt).toHaveBeenCalledWith(
      "updated_at",
      "2026-05-13T10:00:00.000Z"
    );
  });

  it("does not refresh updated_at while a reserved seller heartbeats", async () => {
    sellerReadMaybeSingle.mockResolvedValue({
      data: {
        id: sellerId,
        status: "reserved",
        updated_at: "2026-05-13T10:00:00.000Z"
      },
      error: null
    });
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
          seller_id: sellerId
        })
      })
    );

    expect(response.status).toBe(200);
    expect(sellerUpdate).toHaveBeenCalledWith(
      expect.not.objectContaining({
        updated_at: expect.any(String)
      })
    );
    expect(sellerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "reserved",
        last_heartbeat_at: expect.any(String)
      })
    );
  });

  it("does not overwrite a seller reservation if heartbeat races with quote", async () => {
    sellerReadMaybeSingle.mockResolvedValue({
      data: {
        id: sellerId,
        status: "idle",
        updated_at: "2026-05-13T10:00:00.000Z"
      },
      error: null
    });
    sellerUpdateMaybeSingle.mockResolvedValue({
      data: null,
      error: null
    });
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
          seller_id: sellerId
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "stale",
      seller_status: "unchanged"
    });
    expect(sellerUpdateEqStatus).toHaveBeenCalledWith("status", "idle");
    expect(sellerUpdateEqUpdatedAt).toHaveBeenCalledWith(
      "updated_at",
      "2026-05-13T10:00:00.000Z"
    );
  });

  it("does not overwrite an unbound seller if Passport binding wins the race", async () => {
    sellerReadMaybeSingle.mockResolvedValue({
      data: {
        id: sellerId,
        passport_subject: null
      },
      error: null
    });
    sellerUpdateMaybeSingle.mockResolvedValue({
      data: null,
      error: null
    });
    const response = await registerSeller(
      new Request("https://quotadex.test/api/v1/sellers/register", {
        method: "POST",
        body: JSON.stringify({
          seller_id: sellerId,
          wallet: sellerId,
          passport_payer_addr: sellerId,
          capability: "llama-3",
          price_per_task: "0.001"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("SELLER_REGISTRATION_STALE");
    expect(sellerUpdateIs).toHaveBeenCalledWith("passport_subject", null);
    expect(eventInsert).not.toHaveBeenCalled();
  });
});
