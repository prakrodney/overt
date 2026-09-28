// Live road alerts (police, crashes, objects on the road). Each lasts an hour unless
// someone confirms it; see supabase/migrations/…0015_road_alerts.sql.

import * as Location from "expo-location";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config";
import { rpcAuthed } from "./auth";
import type { Bounds } from "./cameras";

export type RoadAlertType = "police" | "crash" | "hazard";

export type RoadAlert = {
  id: number;
  type: RoadAlertType;
  lat: number;
  lon: number;
  created_at: string;
  expires_at: string;
  confirm_count: number;
  last_confirmed_at: string | null;
  mine?: boolean;
};

export const ALERT_LABEL: Record<RoadAlertType, string> = {
  police: "Police",
  crash: "Crash",
  hazard: "Object on road",
};

export async function fetchRoadAlerts(b: Bounds, signal?: AbortSignal): Promise<RoadAlert[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_road_alerts`, {
    method: "POST",
    signal,
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ min_lon: b.minLon, min_lat: b.minLat, max_lon: b.maxLon, max_lat: b.maxLat }),
  });
  if (!res.ok) throw new Error(`Alerts request failed (${res.status})`);
  return (await res.json()) as RoadAlert[];
}

/** Where you are right now (a fix from the last 20 s is good enough). */
async function here() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") throw new Error("Turn on location for Expo Go to report what's on the road.");
  const last = await Location.getLastKnownPositionAsync({ maxAge: 20_000 });
  const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
  return { lat: pos.coords.latitude, lon: pos.coords.longitude };
}

/** Report an alert at your current spot. */
export async function reportRoadAlert(type: RoadAlertType) {
  const me = await here();
  return rpcAuthed<RoadAlert & { merged?: boolean }>("report_road_alert", {
    p_type: type,
    p_lat: me.lat,
    p_lon: me.lon,
    p_user_lat: me.lat,
    p_user_lon: me.lon,
  });
}

/** `at` = where you were when you passed it (for the pop-up question, answered a few seconds later). */
export async function voteRoadAlert(id: number, vote: "still_there" | "gone", at?: { lat: number; lon: number }) {
  const me = at ?? (await here());
  return rpcAuthed<Partial<RoadAlert> & { removed?: boolean; noted?: boolean }>("vote_road_alert", {
    p_alert_id: id,
    p_vote: vote,
    p_user_lat: me.lat,
    p_user_lon: me.lon,
  });
}

export function minutesAgo(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m === 1) return "1 min ago";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h === 1 ? "1 hr ago" : `${h} hr ago`;
}

export function minutesLeft(iso: string) {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
}
