import { verifyPassportBearerToken } from "@/lib/passport-auth";
import { verifySellerSessionToken } from "@/lib/seller-session";
import { createServerSupabaseClient } from "@/lib/supabase";
import { POST } from "@/app/api/v1/sellers/session/route";

vi.mock("@/lib/passport-auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/passport-auth")>(
      "@/lib/passport-auth"
    );

  return {
    ...actual,
    verifyPassportBearerToken: vi.fn()
  };
});

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

describe("POST /api/v1/sellers/session", () => {
  const sellerId = "0x5555555555555555555555555555555555555555";
  const maybeSingle = vi.fn();
  const selectEq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: selectEq }));
  const updateEq = vi.fn(() => ({ error: null }));
  const update = vi.fn(() => ({ eq: updateEq }));

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.GATEWAY_SALT = "seller-session-secret";

    maybeSingle.mockResolvedValue({
      data: {
        id: sellerId,
        passport_agent_id: "agent-seller-1",
        passport_payer_addr: sellerId,
        passport_subject: null,
        approval_status: "approved"
      },
      error: null
    });
    vi.mocked(verifyPassportBearerToken).mockResolvedValue({
      subject: "user_123",
      email: "seller@example.com",
      issuer: "https://passport.prod.gokite.ai"
    });
    vi.mocked(createServerSupabaseClient).mockReturnValue({
      from: vi.fn(() => ({ select, update }))
    } as never);
  });

  it("rejects seller session creation without a Passport bearer token", async () => {
    const response = await POST(
      new Request("https://quotadex.test/api/v1/sellers/session", {
        method: "POST",
        body: JSON.stringify({
          seller_id: sellerId,
          passport_agent_id: "agent-seller-1"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("PASSPORT_AUTH_REQUIRED");
  });

  it("verifies Passport identity and returns a signed Gateway seller session", async () => {
    const response = await POST(
      new Request("https://quotadex.test/api/v1/sellers/session", {
        method: "POST",
        headers: {
          authorization: "Bearer passport.jwt"
        },
        body: JSON.stringify({
          seller_id: sellerId,
          passport_agent_id: "agent-seller-1"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      seller_id: sellerId,
      token_type: "Bearer"
    });
    expect(typeof body.seller_session_token).toBe("string");
    await expect(
      verifySellerSessionToken(body.seller_session_token, "seller-session-secret")
    ).resolves.toMatchObject({
      sellerId,
      passportAgentId: "agent-seller-1",
      passportSubject: "user_123"
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        passport_subject: "user_123",
        passport_email: "seller@example.com"
      })
    );
  });
});
