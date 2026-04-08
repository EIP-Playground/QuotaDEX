import { notImplementedResponse } from "@/lib/errors";

export async function POST() {
  return notImplementedResponse(
    "POST /api/v1/jobs/quote",
    "Find an idle seller, reserve it in the database, create a payment fingerprint, and return HTTP 402."
  );
}
