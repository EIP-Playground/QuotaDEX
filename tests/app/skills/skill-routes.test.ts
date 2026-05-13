import { describe, expect, it } from "vitest";
import { GET as getBuyerSkill } from "@/app/skills/quotadex-buyer/SKILL.md/route";
import { GET as getSellerSkill } from "@/app/skills/quotadex-seller/SKILL.md/route";

describe("public QuotaDEX skill routes", () => {
  it("serves the buyer skill markdown", async () => {
    const response = await getBuyerSkill();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "text/markdown; charset=utf-8"
    );
    expect(text).toContain("name: quotadex-buyer");
    expect(text).toContain("QuotaDEX Buyer");
  });

  it("serves the seller skill markdown", async () => {
    const response = await getSellerSkill();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "text/markdown; charset=utf-8"
    );
    expect(text).toContain("name: quotadex-seller");
    expect(text).toContain("QuotaDEX Seller");
  });
});
