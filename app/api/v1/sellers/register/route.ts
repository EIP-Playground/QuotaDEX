import { notImplementedResponse } from "@/lib/errors";

export async function POST() {
  return notImplementedResponse(
    "POST /api/v1/sellers/register",
    "Register a seller after local self-check and mark the seller as idle."
  );
}
