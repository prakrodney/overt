// "Fewest cameras" route: ask Mapbox to route around the documented cameras on the
// normal routes, then re-check the result (it may pass different cameras) and try
// again, up to 3 times. Everything is computed on the phone; the route is never
// sent to Overt's server.

import { fetchRoutes, type LatLng, type RouteOption } from "./directions";
import { camerasAlongRoutesDetailed, type Cam } from "./routeCameras";

const MAX_AVOID = 50; // Mapbox limit on excluded points per request
const MAX_TRIES = 4;

export async function findFewerCamerasRoute(
  from: LatLng,
  to: LatLng,
  baseRoutes: RouteOption[],
  baseCams: Cam[][],
  opts: { avoidTolls?: boolean; signal?: AbortSignal } = {}
): Promise<{ route: RouteOption; cameras: number } | null> {
  const baseMin = Math.min(...baseCams.map((c) => c.length));
  if (baseMin === 0) return null; // a normal route already passes none

  // Start with the cameras on the fastest route, then the others, nearest-first order kept.
  const avoid = new Map<number, Cam>();
  const add = (cams: Cam[]) => {
    for (const c of cams) if (avoid.size < MAX_AVOID) avoid.set(c.id, c);
  };
  baseCams.forEach(add);

  let best: { route: RouteOption; cameras: number } | null = null;
  for (let i = 0; i < MAX_TRIES; i++) {
    let rs: RouteOption[];
    try {
      rs = await fetchRoutes(from, to, {
        avoidTolls: opts.avoidTolls,
        signal: opts.signal,
        alternatives: false,
        avoidPoints: [...avoid.values()].map((c) => ({ latitude: c.lat, longitude: c.lon })),
      });
    } catch (e: any) {
      if (e?.name === "AbortError") throw e;
      break; // e.g. no route possible without passing a camera near the destination
    }
    if (!rs.length) break;
    const [cams] = await camerasAlongRoutesDetailed([rs[0]], opts.signal);
    if (!best || cams.length < best.cameras) best = { route: { ...rs[0], id: "fewest" }, cameras: cams.length };
    if (cams.length === 0 || avoid.size >= MAX_AVOID) break;
    const before = avoid.size;
    add(cams);
    if (avoid.size === before) break; // nothing new to avoid
  }

  // Only offer it if it actually beats every normal route, and isn't absurdly long.
  const fastest = Math.min(...baseRoutes.map((r) => r.durationSec));
  if (!best || best.cameras >= baseMin) return null;
  if (best.route.durationSec > fastest * 2 + 600) return null;
  return best;
}
