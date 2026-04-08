import { notImplementedResponse } from "@/lib/errors";

export async function POST() {
  return notImplementedResponse(
    "POST /api/v1/sellers/heartbeat",
    "Refresh seller liveness and keep non-busy sellers in the idle pool."
  );
}
