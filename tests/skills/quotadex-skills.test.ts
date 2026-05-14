import fs from "node:fs";
import path from "node:path";

function readSkill(name: string) {
  return fs.readFileSync(
    path.join(process.cwd(), "skills", name, "SKILL.md"),
    "utf8"
  );
}

describe("QuotaDEX agent skills", () => {
  it("use the public QuotaDEX Gateway URL without deployment env placeholders", () => {
    const buyer = readSkill("quotadex-buyer");
    const seller = readSkill("quotadex-seller");

    for (const skill of [buyer, seller]) {
      expect(skill).toMatch(/https:\/\/quota-dex\.vercel\.app/);
      expect(skill).not.toMatch(/GATEWAY_BASE_URL/);
      expect(skill).not.toMatch(/<gateway_url>/);
      expect(skill).not.toMatch(/operator-provided Gateway URL/i);
      expect(skill).not.toMatch(/Production Smoke Test/i);
      expect(skill).not.toMatch(/export GATEWAY/i);
      expect(skill).toMatch(/Required inputs from the operator/);
    }
  });

  it("documents repeatable Gateway-only buyer and seller flows", () => {
    const buyer = readSkill("quotadex-buyer");
    const seller = readSkill("quotadex-seller");

    expect(buyer).toMatch(/kpass agent:session execute/);
    expect(buyer).toMatch(/payment_target_forbidden/);
    expect(buyer).toMatch(/service discovery/i);
    expect(buyer).toMatch(/skip Step 5/i);
    expect(buyer).toMatch(/temporary direct escrow transfer fallback/i);
    expect(buyer).toMatch(/kpass wallet send/);
    expect(buyer).toMatch(/X_PAYMENT_REQUIRED/);
    expect(buyer).toMatch(/GATEWAY_CONFIG_MISSING/);
    expect(buyer).toMatch(/host not allowed by discovery/i);
    expect(buyer).toMatch(/Do not attempt to extract JWT/i);
    expect(buyer).toMatch(/manual Passport backend API/i);
    expect(buyer).toMatch(/direct-escrow/);
    expect(buyer).toMatch(/exact quote amount/i);
    expect(buyer).toMatch(/Do not use `0\.01 USDC`/);
    expect(buyer).toMatch(/Poll every 5 seconds/i);
    expect(buyer).toMatch(/24 times/);
    expect(buyer).toMatch(/2 minutes/);
    expect(buyer).toMatch(/every minute/);
    expect(buyer).toMatch(/10 minutes/);
    expect(buyer).toMatch(/seller is unresponsive/i);
    expect(buyer).toMatch(/fingerprint.*deterministic/i);
    expect(buyer).toMatch(/kpass activity --output json/);
    expect(buyer).toMatch(/Installing this skill locally/);
    expect(buyer).toMatch(/\/api\/v1\/buyers\/capabilities/);
    expect(buyer).toMatch(/\/api\/v1\/jobs\/quote/);
    expect(buyer).toMatch(/\/api\/v1\/jobs\/verify/);
    expect(buyer).toMatch(/"network_profile":"live-mainnet"/);
    expect(buyer).toMatch(/--assets USDC/);
    expect(buyer).toMatch(/NO_SELLER_AVAILABLE/);
    expect(buyer).toMatch(/do not infer availability from website pages or market-monitoring APIs/i);
    expect(buyer).not.toMatch(/Dashboard/i);
    expect(buyer).not.toMatch(/\/api\/v1\/dashboard/);
    expect(buyer).not.toMatch(/\/api\/v1\/dashboard\/market/);
    expect(seller).toMatch(/\/api\/v1\/sellers\/register/);
    expect(seller).toMatch(/\/api\/v1\/sellers\/session\/challenge/);
    expect(seller).toMatch(/kpass wallet send/);
    expect(seller).toMatch(/\/api\/v1\/sellers\/session/);
    expect(seller).toMatch(/Renew the Gateway seller session/);
    expect(seller).toMatch(/SELLER_RENEWAL_TOKEN/);
    expect(seller).toMatch(/del\(\.seller_renewal_token\)/);
    expect(seller).toMatch(/Authorization: Bearer \$SELLER_SESSION_TOKEN/);
    expect(seller).toMatch(/First-time seller bootstrap/i);
    expect(seller).toMatch(/Returning seller/i);
    expect(seller).toMatch(/Protected profile update/i);
    expect(seller).toMatch(
      /\/api\/v1\/sellers\/register[\s\S]*Authorization: Bearer \$SELLER_SESSION_TOKEN/
    );
    expect(seller).toMatch(/Online seller runtime loop/i);
    expect(seller).toMatch(/poll \+ process/i);
    expect(seller).toMatch(/INFLIGHT_JOB_ID/);
    expect(seller).toMatch(/DONE_JOB_IDS/);
    expect(seller).toMatch(/120s/);
    expect(seller).toMatch(/minimum `?60s`?/i);
    expect(seller).toMatch(/25s/);
    expect(seller).toMatch(/watchdog/i);
    expect(seller).toMatch(/liveness/i);
    expect(seller).toMatch(/Shell handles plumbing; AI handles thinking/);
    expect(seller).toMatch(/Never stop after polling/i);
    expect(seller).toMatch(/Never use file queues/i);
    expect(seller).toMatch(/heartbeat/);
    expect(seller).toMatch(/\/api\/v1\/sellers\/jobs/);
    expect(seller).toMatch(/"network_profile":"live-mainnet"/);
    expect(seller).toMatch(/USDC/);
    expect(seller).not.toMatch(/PASSPORT_JWT/);
    expect(seller).not.toMatch(/seller_signature/);
    expect(seller).not.toMatch(/action: poll/);
  });
});
