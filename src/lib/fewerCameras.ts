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

/** The point on the route polyline closest to the camera. */
function closestPointOnRoute(route: RouteOption, cam: Cam): LatLng {
  const k = Math.cos((cam.lat * Math.PI) / 180) * 111320;
  let best: LatLng = route.coords[0];
  let bestD = Infinity;
  for (let i = 1; i < route.coords.length; i++) {
    const a = route.coords[i - 1], b = route.coords[i];
    const ax = (a.longitude - cam.lon) * k, ay = (a.latitude - cam.lat) * 110540;
    const bx = (b.longitude - cam.lon) * k, by = (b.latitude - cam.lat) * 110540;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const x = ax + t * dx, y = ay + t * dy;
    const d = x * x + y * y;
    if (d < bestD) {
      bestD = d;
      best = {
        latitude: a.latitude + t * (b.latitude - a.latitude),
        longitude: a.longitude + t * (b.longitude - a.longitude),
      };
    }
  }
  return best;
}

export async function findFewerCamerasRoute(
  from: LatLng,
  to: LatLng,
  baseRoutes: RouteOption[],
  baseCams: Cam[][],
  opts: { avoidTolls?: boolean; signal?: AbortSignal } = {}
): Promise<{ route: RouteOption; cameras: number; speedCameras: number } | null> {
  const baseMin = Math.min(...baseCams.map((c) => c.length));
  if (baseMin === 0) return null; // a normal route already passes none

  // Excluded road points, keyed by camera + rounded position so the same spot isn't sent twice.
  const avoid = new Map<string, LatLng>();
  const addFrom = (route: RouteOption, cams: Cam[]) => {
    let added = 0;
    for (const c of cams) {
      if (avoid.size >= MAX_AVOID) break;
      const p = closestPointOnRoute(route, c);
      const key = `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`;
      if (!avoid.has(key)) {
        avoid.set(key, p);
        added++;
      }
    }
    return added;
  };
  // Fastest route's cameras first, then the other routes'.
  baseRoutes.forEach((r, i) => addFrom(r, baseCams[i]));

  let best: { route: RouteOption; cameras: number; speedCameras: number } | null = null;
  for (let i = 0; i < MAX_TRIES; i++) {
    let rs: RouteOption[];
    try {
      rs = await fetchRoutes(from, to, {
        avoidTolls: opts.avoidTolls,
        signal: opts.signal,
        alternatives: true,
        avoidPoints: [...avoid.values()],
      });
    } catch (e: any) {
      if (e?.name === "AbortError") throw e;
      break; // e.g. no route possible without passing a camera near the destination
    }
    if (!rs.length) break;
    // Detours avoid license plate readers only; speed cameras are just counted.
    const all = await camerasAlongRoutesDetailed(rs, opts.signal);
    const cams = all.map((cs) => cs.filter((c) => !c.speed));
    // Pick this try's route with the fewest cameras (ties: quickest).
    let j = 0;
    for (let k = 1; k < rs.length; k++) {
      if (cams[k].length < cams[j].length || (cams[k].length === cams[j].length && rs[k].durationSec < rs[j].durationSec)) j = k;
    }
    const n = cams[j].length;
    if (!best || n < best.cameras || (n === best.cameras && rs[j].durationSec < best.route.durationSec)) {
      best = { route: { ...rs[j], id: "fewest" }, cameras: n, speedCameras: all[j].length - n };
    }
    if (n === 0 || avoid.size >= MAX_AVOID) break;
    if (addFrom(rs[j], cams[j]) === 0) break; // nothing new to avoid
  }

  // Only offer it if it actually beats every normal route, and isn't absurdly long.
  const fastest = Math.min(...baseRoutes.map((r) => r.durationSec));
  if (!best || best.cameras >= baseMin) return null;
  if (best.route.durationSec > fastest * 2 + 600) return null;
  return best;
}
