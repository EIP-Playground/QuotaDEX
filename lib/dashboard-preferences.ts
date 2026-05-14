export type DashboardMode = "demo" | "live";
export type LiveNetwork = "testnet" | "mainnet";

export const DASHBOARD_MODE_COOKIE_NAME = "quotadex_dashboard_mode";
export const DASHBOARD_LIVE_NETWORK_COOKIE_NAME =
  "quotadex_dashboard_live_network";

const DASHBOARD_PREFERENCE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isDashboardMode(value: string | null | undefined): value is DashboardMode {
  return value === "demo" || value === "live";
}

export function isLiveNetwork(value: string | null | undefined): value is LiveNetwork {
  return value === "testnet" || value === "mainnet";
}

export function writeDashboardPreferenceCookie(name: string, value: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${DASHBOARD_PREFERENCE_MAX_AGE_SECONDS}`,
    "SameSite=Lax"
  ].join("; ");
}
