import React from "react";
import { cookies } from "next/headers";
import {
  DASHBOARD_LIVE_NETWORK_COOKIE_NAME,
  DASHBOARD_MODE_COOKIE_NAME,
  isDashboardMode,
  isLiveNetwork
} from "@/lib/dashboard-preferences";
import { MarketplaceClient } from "./marketplace-client";

export default async function MarketplacePage() {
  const cookieStore = await cookies();
  const storedMode = cookieStore.get(DASHBOARD_MODE_COOKIE_NAME)?.value;
  const storedLiveNetwork = cookieStore.get(DASHBOARD_LIVE_NETWORK_COOKIE_NAME)?.value;

  return (
    <MarketplaceClient
      initialLiveNetwork={isLiveNetwork(storedLiveNetwork) ? storedLiveNetwork : "testnet"}
      initialMode={isDashboardMode(storedMode) ? storedMode : "demo"}
    />
  );
}
