// Pro "commute watch": keeps an eye on your Home → Work drive and spots new plate readers.
// The camera list for the route is saved on this phone only.

import * as SecureStore from "expo-secure-store";
import { fetchRoutes } from "./directions";
import { camerasAlongRoutesDetailed } from "./routeCameras";
import type { SavedPlace } from "./savedPlaces";

const KEY = "overt.commute.v1";
/** `seen`: camera id → when it first appeared on the route (0 = was there at the first check). */
type Saved = { route: string; seen: Record<string, number>; checkedAt: number };

export type CommuteStatus = { cameras: number; newCameras: number; minutes: number; checkedAt: number };

export async function checkCommute(home: SavedPlace, work: SavedPlace): Promise<CommuteStatus> {
  const routeKey = `${home.lat.toFixed(4)},${home.lon.toFixed(4)}>${work.lat.toFixed(4)},${work.lon.toFixed(4)}`;
  const [r] = await fetchRoutes(
    { latitude: home.lat, longitude: home.lon },
    { latitude: work.lat, longitude: work.lon },
    { alternatives: false }
  );
  if (!r) throw new Error("No route");
  const [cams] = await camerasAlongRoutesDetailed([r]);
  const ids = cams.filter((c) => c.kind === "alpr").map((c) => c.id);
  let prev: Saved | null = null;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    prev = raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    prev = null;
  }
  const same = prev && prev.route === routeKey && prev.seen;
  const now = Date.now();
  const seen: Record<string, number> = {};
  for (const id of ids.slice(0, 150)) {
    seen[id] = same && id in prev!.seen ? prev!.seen[id] : same ? now : 0;
  }
  // "New" = first showed up on your commute in the last 7 days.
  const newCameras = Object.values(seen).filter((t) => t > now - 7 * 86_400_000).length;
  const saved: Saved = { route: routeKey, seen, checkedAt: now };
  SecureStore.setItemAsync(KEY, JSON.stringify(saved)).catch(() => {});
  return { cameras: ids.length, newCameras, minutes: Math.round(r.durationSec / 60), checkedAt: saved.checkedAt };
}
