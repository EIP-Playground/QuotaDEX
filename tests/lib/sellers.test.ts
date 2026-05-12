import { parseRegisterSellerBody } from "@/lib/sellers";

describe("parseRegisterSellerBody", () => {
  it("rejects zero-priced sellers for production x402 escrow jobs", () => {
    expect(() =>
      parseRegisterSellerBody({
        seller_id: "0x5555555555555555555555555555555555555555",
        capability: "gpt-4o",
        price_per_task: "0",
        passport_payer_addr: "0x5555555555555555555555555555555555555555"
      })
    ).toThrow("price_per_task must be a positive number.");
  });
});
