// Community reports: confirm, mark gone, report new equipment, flag issues.
// Your location is sent only to check you're within 300 m of the equipment;
// the server stores the distance, never where you were.

import * as Location from "expo-location";
import { rpcAuthed } from "./auth";

export type VoteResult = { status: string; confidence_level: string; confirm_count: number };

async function here() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") throw new Error("Turn on location for Expo Go so we can check you're near the camera.");
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lon: pos.coords.longitude };
}

export async function voteOnPoint(pointId: number, verdict: "confirm" | "gone") {
  const me = await here();
  return rpcAuthed<VoteResult>("vote_on_point", {
    p_point_id: pointId,
    p_verdict: verdict,
    p_user_lat: me.lat,
    p_user_lon: me.lon,
  });
}

export async function reportNewPoint(lat: number, lon: number, directionDeg: number | null) {
  const me = await here();
  return rpcAuthed<{ point_id?: number; merged_into?: number; note?: string }>("report_new_point", {
    p_lat: lat,
    p_lon: lon,
    p_direction_deg: directionDeg,
    p_user_lat: me.lat,
    p_user_lon: me.lon,
  });
}

export async function reportIssue(pointId: number, kind: "wrong_location" | "details_wrong" | "other", note?: string) {
  return rpcAuthed("report_issue", { p_point_id: pointId, p_kind: kind, p_note: note ?? null });
}
