// Pro "drive mode": while you're driving without a route, warn about plate readers,
// speed / red-light cameras and road alerts coming up ahead in your direction of travel.
// Everything is worked out on the phone from nearby cameras (fetched in ~3 km boxes).

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config";
import type { Cam } from "./routeCameras";

export type AheadItem = { key: string; lat: number; lon: number; dir: number | null; label: string; kind: string };
export type DriveHit = { key: string; label: string; kind: string; meters: number };

const LOOK_AHEAD_M = 450;
const CONE_DEG = 25; // must be roughly straight ahead
const LANE_M = 45; // and close to the line you're driving
const REPEAT_MS = 10 * 60_000; // don't repeat the same warning for 10 minutes

function meters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const k = Math.cos((a.lat * Math.PI) / 180) * 111320;
  return Math.hypot((a.lon - b.lon) * k, (a.lat - b.lat) * 110540);
}
function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const k = Math.cos((a.lat * Math.PI) / 180);
  return ((Math.atan2((b.lon - a.lon) * k, b.lat - a.lat) * 180) / Math.PI + 360) % 360;
}
const angDiff = (a: number, b: number) => {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
};
const axisDiff = (a: number, b: number) => {
  const d = Math.abs(((a - b) % 180) + 180) % 180;
  return Math.min(d, 180 - d);
};

export async function fetchNearbyCams(lat: number, lon: number): Promise<Cam[]> {
  const box = [lon - 0.035, lat - 0.03, lon + 0.035, lat + 0.03];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_cameras_in_boxes`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ boxes: [box], max_count: 5000 }),
  });
  if (!res.ok) throw new Error(`Camera lookup failed (${res.status})`);
  const rows = (await res.json()) as [number, number, number, number | null, number?][];
  return rows.map(([id, clat, clon, dir, k]) => ({
    id,
    lat: clat,
    lon: clon,
    dir,
    speed: k === 1 || k === 2,
    kind: k === 1 ? "speed" : k === 2 ? "red_light" : "alpr",
  }));
}

export const CAM_LABEL: Record<string, string> = {
  alpr: "Plate reader ahead",
  speed: "Speed camera ahead",
  red_light: "Red-light camera ahead",
  police: "Police reported ahead",
  crash: "Crash reported ahead",
  hazard: "Object on road ahead",
};

/** Keeps track of what's been announced; call `check` with each GPS fix. */
export class DriveWatcher {
  private said = new Map<string, number>();
  private passed = new Set<string>();

  /** Items ahead that haven't been announced recently. */
  check(fix: { lat: number; lon: number; heading: number }, items: AheadItem[]): DriveHit[] {
    const now = Date.now();
    const hits: DriveHit[] = [];
    for (const it of items) {
      const d = meters(fix, it);
      if (d > LOOK_AHEAD_M || d < 15) continue;
      const b = bearing(fix, it);
      const off = angDiff(b, fix.heading);
      if (off > CONE_DEG) continue;
      if (Math.sin((off * Math.PI) / 180) * d > LANE_M) continue;
      // A camera facing across your road isn't watching your lane.
      if (it.dir != null && axisDiff(it.dir, fix.heading) > 50) continue;
      const last = this.said.get(it.key);
      if (last && now - last < REPEAT_MS) continue;
      this.said.set(it.key, now);
      hits.push({ key: it.key, label: it.label, kind: it.kind, meters: d });
    }
    return hits.sort((a, b) => a.meters - b.meters);
  }

  /** Plate readers you actually drove past (within ~40 m after being warned). Counted once. */
  passedNow(fix: { lat: number; lon: number }, items: AheadItem[]): string[] {
    const out: string[] = [];
    for (const it of items) {
      if (it.kind !== "alpr" || !this.said.has(it.key) || this.passed.has(it.key)) continue;
      if (meters(fix, it) < 40) {
        this.passed.add(it.key);
        out.push(it.key);
      }
    }
    return out;
  }
}

export function feetText(m: number) {
  const ft = Math.round((m * 3.28084) / 50) * 50;
  return ft >= 1000 ? `${(m / 1609.344).toFixed(1)} mi` : `${Math.max(50, ft)} ft`;
}

export { meters as metersBetween };

/**
 * Notices when you've driven past a camera: you came within ~35 m of it and are now
 * 70+ m past. Used for the "Still here?" question. Each camera is reported once per session.
 */
export class PassTracker {
  private close = new Map<string, number>(); // key -> closest distance so far
  private done = new Set<string>();

  update(fix: { lat: number; lon: number }, items: { key: string; lat: number; lon: number }[]): string[] {
    const out: string[] = [];
    for (const it of items) {
      if (this.done.has(it.key)) continue;
      const d = meters(fix, it);
      if (d < 35) {
        this.close.set(it.key, Math.min(d, this.close.get(it.key) ?? Infinity));
      } else if (d > 70 && this.close.has(it.key)) {
        this.close.delete(it.key);
        this.done.add(it.key);
        out.push(it.key);
      }
    }
    return out;
  }
}
