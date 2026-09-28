// "Fewer cameras" detour: ask Mapbox to route around the documented cameras on the
// normal routes, then re-check the result (it may pass different cameras) and try
// again. Everything is computed on the phone; the route is never sent to Overt's server.
//
// Mapbox snaps each excluded point to the nearest road. A camera usually sits on the
// roadside or at a corner, so its own coordinate can snap to the cross street instead of
// the road the route drives (that's how a detour kept passing the camera at Elam Rd and
// S Buckner Blvd in Dallas). So we exclude the spot ON THE ROUTE LINE closest to each
// camera, which lands on the road actually driven.

import { fetchRoutes, type LatLng, type RouteOption } from "./directions";
import { camerasAlongRoutesDetailed, type Cam } from "./routeCameras";

const MAX_AVOID = 50; // Mapbox limit on excluded points per request
const MAX_TRIES = 6;

/**
 * Points on the route polyline near the camera: the closest one, and (with `spread`) points
 * `spread` metres before and after it along the line. A camera at an intersection can make a
 * single point snap to the cross street; points a little way up and down the road itself can't.
 */
function pointsNearCamera(route: RouteOption, cam: Cam, spread = 0): LatLng[] {
  const c = route.coords;
  const k = Math.cos((cam.lat * Math.PI) / 180) * 111320;
  let bestI = 1, bestT = 0, bestD = Infinity;
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1], b = c[i];
    const ax = (a.longitude - cam.lon) * k, ay = (a.latitude - cam.lat) * 110540;
    const bx = (b.longitude - cam.lon) * k, by = (b.latitude - cam.lat) * 110540;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const x = ax + t * dx, y = ay + t * dy;
    const d = x * x + y * y;
    if (d < bestD) {
      bestD = d;
      bestI = i;
      bestT = t;
    }
  }
  const lerp = (i: number, t: number): LatLng => ({
    latitude: c[i - 1].latitude + t * (c[i].latitude - c[i - 1].latitude),
    longitude: c[i - 1].longitude + t * (c[i].longitude - c[i - 1].longitude),
  });
  const out = [lerp(bestI, bestT)];
  if (!spread) return out;
  const segLen = (i: number) =>
    Math.hypot((c[i].longitude - c[i - 1].longitude) * k, (c[i].latitude - c[i - 1].latitude) * 110540);
  // Walk `spread` metres forward, then backward, from the closest point.
  const walk = (dir: 1 | -1) => {
    let i = bestI, t = bestT, left = spread;
    while (true) {
      const len = segLen(i) || 1e-6;
      const room = dir > 0 ? (1 - t) * len : t * len;
      if (left <= room) return lerp(i, t + (dir * left) / len);
      left -= room;
      i += dir;
      if (i < 1 || i >= c.length) return null; // ran off the start / end of the route
      t = dir > 0 ? 0 : 1;
    }
  };
  for (const p of [walk(1), walk(-1)]) if (p) out.push(p);
  return out;
}

export async function findFewerCamerasRoute(
  from: LatLng,
  to: LatLng,
  baseRoutes: RouteOption[],
  baseCams: Cam[][],
  opts: {
    avoidTolls?: boolean;
    avoidHighways?: boolean;
    stops?: LatLng[];
    departAt?: number | null;
    signal?: AbortSignal;
    /** Pro "avoid all plate readers": extra time allowed over the fastest route (seconds; Infinity = any). */
    maxExtraSec?: number;
    /** More attempts for the Pro mode. */
    tries?: number;
  } = {}
): Promise<{ route: RouteOption; cameras: number; speedCameras: number; redLights: number } | null> {
  const baseMin = Math.min(...baseCams.map((c) => c.length));
  if (baseMin === 0) return null; // a normal route already passes none

  // Excluded road points, keyed by camera + rounded position so the same spot isn't sent twice.
  const avoid = new Map<string, LatLng>();
  const addFrom = (route: RouteOption, cams: Cam[], spread = 0) => {
    let added = 0;
    for (const c of cams) {
      for (const p of pointsNearCamera(route, c, spread)) {
        if (avoid.size >= MAX_AVOID) return added;
        const key = `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`;
        if (!avoid.has(key)) {
          avoid.set(key, p);
          added++;
        }
      }
    }
    return added;
  };
  // Fastest route's cameras first, then the other routes'.
  baseRoutes.forEach((r, i) => addFrom(r, baseCams[i]));

  const fastest = Math.min(...baseRoutes.map((r) => r.durationSec));
  const limit = opts.maxExtraSec != null ? fastest + opts.maxExtraSec : fastest * 2 + 600;
  let best: { route: RouteOption; cameras: number; speedCameras: number; redLights: number } | null = null;
  for (let i = 0; i < (opts.tries ?? MAX_TRIES); i++) {
    let rs: RouteOption[];
    try {
      rs = await fetchRoutes(from, to, {
        avoidTolls: opts.avoidTolls,
        avoidHighways: opts.avoidHighways,
        stops: opts.stops,
        departAt: opts.departAt,
        signal: opts.signal,
        alternatives: true,
        avoidPoints: [...avoid.values()],
      });
    } catch (e: any) {
      if (e?.name === "AbortError") throw e;
      break; // e.g. no route possible without passing a camera near the destination
    }
    if (!rs.length) break;
    // Detours avoid license plate readers only; speed / red-light cameras are just counted.
    const all = await camerasAlongRoutesDetailed(rs, opts.signal);
    const cams = all.map((cs) => cs.filter((c) => !c.speed));
    // Pick this try's route with the fewest cameras (ties: quickest), within the time limit if possible.
    let j = 0;
    const better = (k: number, m: number) =>
      cams[k].length < cams[m].length || (cams[k].length === cams[m].length && rs[k].durationSec < rs[m].durationSec);
    for (let k = 1; k < rs.length; k++) if (better(k, j)) j = k;
    let jOk = -1;
    for (let k = 0; k < rs.length; k++) if (rs[k].durationSec <= limit && (jOk < 0 || better(k, jOk))) jOk = k;
    if (jOk >= 0) {
      const n = cams[jOk].length;
      if (!best || n < best.cameras || (n === best.cameras && rs[jOk].durationSec < best.route.durationSec)) {
        best = {
          route: { ...rs[jOk], id: "fewest" },
          cameras: n,
          speedCameras: all[jOk].filter((c) => c.kind === "speed").length,
          redLights: all[jOk].filter((c) => c.kind === "red_light").length,
        };
      }
    }
    const n = cams[j].length;
    if (n === 0 || avoid.size >= MAX_AVOID) break;
    // Still passing the same cameras? Also block the road a little before and after them
    // (an intersection camera's own spot can snap to the cross street), then wider.
    if (addFrom(rs[j], cams[j]) === 0 && addFrom(rs[j], cams[j], 40) === 0 && addFrom(rs[j], cams[j], 90) === 0) break;
  }

  // Only offer it if it actually beats every normal route, and fits the time limit.
  if (!best || best.cameras >= baseMin) return null;
  if (best.route.durationSec > limit) return null;
  return best;
}
