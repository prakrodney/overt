// Route previews from the Mapbox Directions API.
// Everything routing-related goes through this file, so the provider can be
// swapped later (the plan's self-hosted Valhalla/OSRM) without touching the UI.

import { MAPBOX_TOKEN_OVERRIDE, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config";

export type LatLng = { latitude: number; longitude: number };

/** One leg of turn-by-turn guidance: drive this stretch, then do the maneuver at its end. */
export type NavStep = {
  distanceM: number;
  durationSec: number;
  name: string;
  coords: LatLng[];
  /** The maneuver at the START of this step (e.g. "Turn right onto Elam Road"). */
  maneuver: { type: string; modifier?: string; instruction: string };
  /** Spoken while driving this step; `before` = metres before the step's end. */
  voice: { before: number; text: string }[];
  /** Banner shown while driving this step, describing the maneuver at its end. */
  banner: { before: number; text: string; type?: string; modifier?: string; then?: string }[];
};

export type RouteOption = {
  id: string;
  coords: LatLng[];
  durationSec: number;
  distanceM: number;
  hasToll: boolean;
  summary: string;
  steps: NavStep[];
};

let tokenPromise: Promise<string> | null = null;

/** The Mapbox public token: local override, else fetched once from Supabase. */
export function getMapboxToken(): Promise<string> {
  if (MAPBOX_TOKEN_OVERRIDE.startsWith("pk.")) return Promise.resolve(MAPBOX_TOKEN_OVERRIDE);
  tokenPromise ??= fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_config`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: "{}",
  })
    .then((r) => (r.ok ? r.json() : {}))
    .then((cfg: { mapbox_token?: string }) => cfg.mapbox_token ?? "")
    .catch(() => "")
    .then((t) => {
      if (!t.startsWith("pk.")) tokenPromise = null; // try again next time
      return t;
    });
  return tokenPromise;
}

export async function fetchRoutes(
  from: LatLng,
  to: LatLng,
  opts: {
    avoidTolls?: boolean;
    signal?: AbortSignal;
    /** Road points to route around (Mapbox allows at most 50). */
    avoidPoints?: LatLng[];
    alternatives?: boolean;
  } = {}
): Promise<RouteOption[]> {
  const token = await getMapboxToken();
  if (!token.startsWith("pk.")) throw new Error("Couldn't load the Mapbox settings. Check your connection and try again.");
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const params = new URLSearchParams({
    alternatives: opts.alternatives === false ? "false" : "true",
    geometries: "geojson",
    overview: "full",
    steps: "true", // turn-by-turn steps (also used to spot toll roads)
    voice_instructions: "true",
    banner_instructions: "true",
    voice_units: "imperial",
    access_token: token,
  });
  const exclude: string[] = [];
  if (opts.avoidTolls) exclude.push("toll");
  for (const p of (opts.avoidPoints ?? []).slice(0, 50)) {
    exclude.push(`point(${p.longitude.toFixed(6)} ${p.latitude.toFixed(6)})`);
  }
  if (exclude.length) params.set("exclude", exclude.join(","));
  const res = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?${params}`,
    { signal: opts.signal }
  );
  const json = await res.json();
  if (!res.ok || json.code !== "Ok") {
    if (json.code === "NoRoute") throw new Error("No driving route found to this place.");
    throw new Error(json.message || `Directions failed (${res.status})`);
  }
  return (json.routes as any[]).slice(0, 3).map((r, i) => ({
    id: `r${i}`,
    coords: (r.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({
      latitude: lat,
      longitude: lon,
    })),
    durationSec: r.duration,
    distanceM: r.distance,
    hasToll: (r.legs as any[]).some((leg) =>
      (leg.steps as any[]).some((step) =>
        (step.intersections as any[] | undefined)?.some((x) => x.classes?.includes("toll"))
      )
    ),
    summary: (r.legs as any[]).map((l) => l.summary).filter(Boolean).join(", "),
    steps: (r.legs as any[]).flatMap((leg) =>
      (leg.steps as any[]).map(
        (st): NavStep => ({
          distanceM: st.distance,
          durationSec: st.duration,
          name: st.name ?? "",
          coords: ((st.geometry?.coordinates ?? []) as [number, number][]).map(([lon, lat]) => ({
            latitude: lat,
            longitude: lon,
          })),
          maneuver: {
            type: st.maneuver?.type ?? "",
            modifier: st.maneuver?.modifier,
            instruction: st.maneuver?.instruction ?? "",
          },
          voice: ((st.voiceInstructions ?? []) as any[]).map((v) => ({
            before: v.distanceAlongGeometry,
            text: v.announcement,
          })),
          banner: ((st.bannerInstructions ?? []) as any[]).map((b) => ({
            before: b.distanceAlongGeometry,
            text: b.primary?.text ?? "",
            type: b.primary?.type,
            modifier: b.primary?.modifier,
            then: b.secondary?.text,
          })),
        })
      )
    ),
  }));
}

export function formatDuration(sec: number) {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function formatMiles(m: number) {
  const mi = m / 1609.344;
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}
