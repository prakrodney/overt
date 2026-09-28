// Invites (a free Pro week for you and a friend), reporter badges, the admin list of
// cameras people say are gone, and the Pro camera density layer.

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config";
import { hasSession, rpcAuthed } from "./auth";
import { setGiftUntil } from "./pro";

// ---- Invite a friend ------------------------------------------------------------------
export type InviteInfo = { code: string; friends: number; used_code: boolean; pro_until: string | null };

const applyGift = (until: string | null | undefined) => setGiftUntil(until ? Date.parse(until) || 0 : 0);

export async function myInvite(): Promise<InviteInfo> {
  const r = await rpcAuthed<InviteInfo>("my_invite", {});
  applyGift(r.pro_until);
  return r;
}

export async function redeemInvite(code: string) {
  const r = await rpcAuthed<{ ok: boolean; pro_until: string }>("redeem_invite", { p_code: code });
  applyGift(r.pro_until);
  return r;
}

/** At app start: pick up Pro weeks earned from invites (doesn't create an account). */
export async function refreshGift() {
  if (!(await hasSession())) return;
  try {
    const r = await rpcAuthed<{ pro_until: string | null }>("my_pro_grant", {});
    applyGift(r.pro_until);
  } catch {
    // offline: keep what we had
  }
}

// ---- Reporter badges ---------------------------------------------------------------------
export type Contributions = {
  cameras: number;
  accepted: number;
  confirms: number;
  gone: number;
  alerts: number;
  trust: number;
  friends: number;
};

export async function myContributions(): Promise<Contributions> {
  if (!(await hasSession())) return { cameras: 0, accepted: 0, confirms: 0, gone: 0, alerts: 0, trust: 10, friends: 0 };
  return rpcAuthed<Contributions>("my_contributions", {});
}

export type Badge = {
  id: string;
  name: string;
  how: string;
  /** 0..1 progress toward earning it. */
  progress: number;
  earned: boolean;
  color: string;
};

export function badgesFor(c: Contributions): Badge[] {
  const checks = c.confirms + c.gone;
  const total = c.cameras + checks + c.alerts;
  const b = (id: string, name: string, how: string, have: number, need: number, color: string): Badge => ({
    id,
    name,
    how,
    progress: Math.min(1, have / need),
    earned: have >= need,
    color,
  });
  return [
    b("first", "First report", "Report or confirm anything once", total, 1, "#4A4FD6"),
    b("spotter", "Spotter", "Add 5 cameras to the map", c.cameras, 5, "#E0352B"),
    b("eagle", "Eagle eye", "Add 25 cameras to the map", c.cameras, 25, "#B0186E"),
    b("checker", "Fact checker", "Answer \"Still here?\" 10 times", checks, 10, "#17863F"),
    b("squad", "Truth squad", "Answer \"Still here?\" 50 times", checks, 50, "#0E6B5C"),
    b("helper", "Road helper", "Report 10 police, crashes or objects", c.alerts, 10, "#D98200"),
    b("trusted", "Trusted reporter", "Get your camera reports confirmed by others", c.trust, 50, "#2458E6"),
    b("friend", "Good friend", "Invite a friend who joins", c.friends, 1, "#8E44C9"),
  ];
}

// ---- Admin: cameras people say are gone --------------------------------------------------------
export type Disputed = {
  id: number;
  category: string;
  status: string;
  source: string;
  operator: string | null;
  lat: number;
  lon: number;
  gone_votes: number;
  still_there_votes: number;
  last_gone_at: string;
};

export const listDisputed = () => rpcAuthed<Disputed[]>("admin_list_disputed", {});
export const resolveDisputed = (id: number, action: "keep" | "remove") =>
  rpcAuthed<{ ok: boolean }>("admin_resolve_disputed", { p_point_id: id, p_action: action });

// ---- Pro: camera density map ----------------------------------------------------------------
export type DensityCell = { south: number; west: number; size: number; count: number };

/** Plate readers per grid square in the box; about 20 squares across the screen. */
export async function fetchDensity(
  b: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  signal?: AbortSignal
): Promise<DensityCell[]> {
  // Square sizes come from a fixed ladder (0.005°, 0.01°, 0.02°…) so the grid doesn't
  // jump around as you pan. The server uses max(cell, width/45, height/45); ours is bigger.
  const want = Math.max(b.maxLon - b.minLon, b.maxLat - b.minLat) / 20;
  let cell = 0.005;
  while (cell < want) cell *= 2;
  const size = Math.max(cell, 0.005, (b.maxLon - b.minLon) / 45, (b.maxLat - b.minLat) / 45);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_camera_density`, {
    method: "POST",
    signal,
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ min_lon: b.minLon, min_lat: b.minLat, max_lon: b.maxLon, max_lat: b.maxLat, cell }),
  });
  if (!res.ok) throw new Error(`Density lookup failed (${res.status})`);
  const rows = (await res.json()) as [number, number, number][];
  return rows.map(([south, west, count]) => ({ south, west, size, count }));
}
