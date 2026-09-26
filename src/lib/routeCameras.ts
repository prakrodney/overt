// Counts documented cameras along each route, on the device.
//
// Privacy: the server never sees a route. We ask for the cameras inside a few
// coarse boxes (~20 km) that cover all routes, then measure distances here.

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config";
import type { LatLng, RouteOption } from "./directions";

/** A camera counts as "on the route" within this many metres of the line. */
export const ON_ROUTE_METERS = 30;

type Cam = { id: number; lat: number; lon: number };

const BOX_DEG = 0.18; // ~20 km

function coarseBoxes(routes: RouteOption[]) {
  // Snap every route point to a ~20 km grid, then send each touched cell (padded).
  const cells = new Set<string>();
  for (const r of routes) {
    for (const p of r.coords) {
      cells.add(`${Math.floor(p.longitude / BOX_DEG)}:${Math.floor(p.latitude / BOX_DEG)}`);
    }
  }
  const pad = 0.002; // ~200 m so cameras right at a cell edge aren't missed
  return [...cells].slice(0, 200).map((k) => {
    const [x, y] = k.split(":").map(Number);
    return [x * BOX_DEG - pad, y * BOX_DEG - pad, (x + 1) * BOX_DEG + pad, (y + 1) * BOX_DEG + pad];
  });
}

async function fetchCorridorCameras(routes: RouteOption[], signal?: AbortSignal): Promise<Cam[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_cameras_in_boxes`, {
    method: "POST",
    signal,
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ boxes: coarseBoxes(routes), max_count: 50000 }),
  });
  if (!res.ok) throw new Error(`Camera lookup failed (${res.status})`);
  const rows = (await res.json()) as [number, number, number, number | null][];
  return rows.map(([id, lat, lon]) => ({ id, lat, lon }));
}

/** Metres from point P to segment AB, using a local flat projection (fine at these scales). */
function distToSegment(p: LatLng, a: LatLng, b: LatLng) {
  const k = Math.cos((p.latitude * Math.PI) / 180) * 111320;
  const ax = (a.longitude - p.longitude) * k, ay = (a.latitude - p.latitude) * 110540;
  const bx = (b.longitude - p.longitude) * k, by = (b.latitude - p.latitude) * 110540;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  const x = ax + t * dx, y = ay + t * dy;
  return Math.sqrt(x * x + y * y);
}

/** Camera IDs within ON_ROUTE_METERS of each route (same order as `routes`). */
export async function camerasAlongRoutes(
  routes: RouteOption[],
  signal?: AbortSignal
): Promise<number[][]> {
  const cams = await fetchCorridorCameras(routes, signal);

  // Bucket cameras into ~1 km cells so each segment only checks its neighbours.
  const CELL = 0.01;
  const grid = new Map<string, Cam[]>();
  for (const c of cams) {
    const key = `${Math.floor(c.lon / CELL)}:${Math.floor(c.lat / CELL)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(c);
  }

  return routes.map((r) => {
    const hit = new Set<number>();
    for (let i = 1; i < r.coords.length; i++) {
      const a = r.coords[i - 1], b = r.coords[i];
      const x0 = Math.floor(Math.min(a.longitude, b.longitude) / CELL) - 1;
      const x1 = Math.floor(Math.max(a.longitude, b.longitude) / CELL) + 1;
      const y0 = Math.floor(Math.min(a.latitude, b.latitude) / CELL) - 1;
      const y1 = Math.floor(Math.max(a.latitude, b.latitude) / CELL) + 1;
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          for (const c of grid.get(`${x}:${y}`) ?? []) {
            if (hit.has(c.id)) continue;
            if (distToSegment({ latitude: c.lat, longitude: c.lon }, a, b) <= ON_ROUTE_METERS) {
              hit.add(c.id);
            }
          }
        }
      }
    }
    return [...hit];
  });
}
