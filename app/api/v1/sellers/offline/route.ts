import { notImplementedResponse } from "@/lib/errors";

export async function POST() {
  return notImplementedResponse(
    "POST /api/v1/sellers/offline",
    "Allow a seller worker to move itself to the offline state."
  );
}
