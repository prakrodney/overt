import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config";

export type CameraPoint = {
  id: number;
  lat: number;
  lon: number;
  category: string;
  subtype: string | null;
  manufacturer: string | null;
  operator: string | null;
  mount: string | null;
  directions: number[];
  confidence_level: "verified" | "community" | "needs_confirmation";
  source: string;
  osm_type: "node" | "way" | "relation" | null;
  osm_id: number | null;
  updated_at: string | null;
  last_verified_at: string | null;
  confirm_count?: number;
};

export type CameraCluster = {
  id: string;
  count: number;
  lat: number;
  lon: number;
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
};

export type CameraLayer = {
  mode: "points" | "clusters";
  points: CameraPoint[];
  clusters: CameraCluster[];
};

export type Bounds = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

/** Loads only what's inside `bounds`; the server clusters below zoom 15. */
export async function fetchCameraLayer(
  bounds: Bounds,
  zoom: number,
  signal?: AbortSignal
): Promise<CameraLayer> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_camera_layer`, {
    method: "POST",
    signal,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      min_lon: bounds.minLon,
      min_lat: bounds.minLat,
      max_lon: bounds.maxLon,
      max_lat: bounds.maxLat,
      zoom,
    }),
  });
  if (!res.ok) {
    throw new Error(`Camera layer request failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as CameraLayer;
}
