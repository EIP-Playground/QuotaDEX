import fs from "node:fs";
import path from "node:path";

function readSkill(name: string) {
  return fs.readFileSync(
    path.join(process.cwd(), "skills", name, "SKILL.md"),
    "utf8"
  );
}

describe("QuotaDEX agent skills", () => {
  it("do not assume deployment environment variables or include smoke tests", () => {
    const buyer = readSkill("quotadex-buyer");
    const seller = readSkill("quotadex-seller");

    for (const skill of [buyer, seller]) {
      expect(skill).not.toMatch(/GATEWAY_BASE_URL/);
      expect(skill).not.toMatch(/Production Smoke Test/i);
      expect(skill).not.toMatch(/export GATEWAY/i);
      expect(skill).toMatch(/Required inputs from the operator/);
      expect(skill).toMatch(/Do not assume the Gateway URL/);
    }
  });

  it("documents repeatable Gateway-only buyer and seller flows", () => {
    const buyer = readSkill("quotadex-buyer");
    const seller = readSkill("quotadex-seller");

    expect(buyer).toMatch(/kpass agent:session execute/);
    expect(buyer).toMatch(/\/api\/v1\/jobs\/quote/);
    expect(buyer).toMatch(/\/api\/v1\/jobs\/verify/);
    expect(seller).toMatch(/\/api\/v1\/sellers\/register/);
    expect(seller).toMatch(/\/api\/v1\/sellers\/jobs/);
    expect(seller).toMatch(/action: poll/);
  });
});
