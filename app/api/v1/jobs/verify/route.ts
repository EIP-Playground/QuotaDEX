import { notImplementedResponse } from "@/lib/errors";

export async function POST() {
  return notImplementedResponse(
    "POST /api/v1/jobs/verify",
    "Validate the payment fingerprint and tx hash, then create the paid job."
  );
}
