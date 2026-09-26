// Overt · import-osm
// Pulls ALPRs (surveillance:type=ALPR) from OpenStreetMap via the Overpass API
// and upserts them into public.surveillance_points.
//
// POST body: { "region": "conus-00", "bbox": [south, west, north, east], "useArea": false }
//        or: { "action": "load-boundary" }   (loads the US outline used to drop non-US points)
// Header:    x-import-secret: <private.import_config.secret>
//
// Data © OpenStreetMap contributors, available under the ODbL.

// Public Overpass mirrors, tried in order with a time budget each, so a run
// fits inside the edge function's 150 s limit. A region that fails is simply
// retried on the next scheduled run.
const OVERPASS_URLS: [string, number][] = [
  ["https://overpass-api.de/api/interpreter", 95000],
  ["https://maps.mail.ru/osm/tools/overpass/api/interpreter", 45000],
];

const CARDINALS: Record<string, number> = {
  N: 0, NNE: 22, NE: 45, ENE: 67, E: 90, ESE: 112, SE: 135, SSE: 157,
  S: 180, SSW: 202, SW: 225, WSW: 247, W: 270, WNW: 292, NW: 315, NNW: 337,
};

function parseOne(part: string): number | null {
  const s = part.trim().toUpperCase();
  if (!s) return null;
  if (s in CARDINALS) return CARDINALS[s];
  // Range like "45-90" -> centre of the range
  const range = s.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (range) {
    let a = parseFloat(range[1]);
    let b = parseFloat(range[2]);
    if (b < a) b += 360;
    return Math.round(((a + b) / 2) % 360);
  }
  const n = parseFloat(s);
  if (Number.isFinite(n)) return Math.round(((n % 360) + 360) % 360);
  return null;
}

export function parseDirections(raw?: string): number[] {
  if (!raw) return [];
  return raw
    .split(/[;,]/)
    .map(parseOne)
    .filter((d): d is number => d !== null)
    .slice(0, 8);
}

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  version?: number;
  timestamp?: string;
  tags?: Record<string, string>;
};

function toRow(el: OsmElement) {
  const tags = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  const direction_raw =
    tags["direction"] ?? tags["camera:direction"] ?? tags["surveillance:direction"] ?? null;
  return {
    osm_type: el.type,
    osm_id: el.id,
    osm_version: el.version ?? null,
    osm_updated_at: el.timestamp ?? null,
    lat,
    lon,
    subtype: tags["camera:type"] ?? tags["surveillance:zone"] ?? null,
    manufacturer: tags["manufacturer"] ?? tags["brand"] ?? null,
    operator: tags["operator"] ?? null,
    mount: tags["camera:mount"] ?? null,
    direction_raw,
    directions: parseDirections(direction_raw ?? undefined),
    tags,
  };
}

async function overpass(query: string): Promise<OsmElement[]> {
  const errors: string[] = [];
  for (const [url, budget] of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Overt/0.1 (ALPR map prototype; supabase edge function)",
        },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(budget),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.remark && /runtime error|timed out/i.test(json.remark)) {
          errors.push(`${new URL(url).host}: ${json.remark}`);
          continue;
        }
        return json.elements ?? [];
      }
      errors.push(`${new URL(url).host}: HTTP ${res.status}`);
    } catch (e) {
      errors.push(`${new URL(url).host}: ${e instanceof Error ? e.name : e}`);
    }
  }
  throw new Error(`Overpass failed (${errors.join("; ")})`);
}

async function rpc(fn: string, args: unknown) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn}: HTTP ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req) => {
  const ok = await rpc("verify_import_secret", {
    p_secret: req.headers.get("x-import-secret") ?? "",
  }).catch(() => false);
  if (ok !== true) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));

  // One-time / occasional: load the US outline used to drop non-US points.
  if (body.action === "load-boundary") {
    const t0 = Date.now();
    try {
      const meta = await (await fetch("https://www.geoboundaries.org/api/current/gbOpen/USA/ADM0/")).json();
      const url: string = meta.simplifiedGeometryGeoJSON ?? meta.gjDownloadURL;
      const gj = await (await fetch(url)).json();
      const geometry = gj.type === "FeatureCollection" ? gj.features[0].geometry : gj.geometry ?? gj;
      const parts = await rpc("load_us_boundary", { p_geojson: geometry });
      await rpc("log_import_run", {
        p_region: "boundary", p_fetched: 0, p_upserted: Number(parts) || 0,
        p_error: null, p_note: `boundary from ${url} in ${Date.now() - t0} ms`,
      });
      return Response.json({ parts });
    } catch (e) {
      await rpc("log_import_run", {
        p_region: "boundary", p_fetched: 0, p_upserted: 0, p_error: String(e), p_note: null,
      }).catch(() => {});
      return Response.json({ error: String(e) }, { status: 500 });
    }
  }

  const region: string = body.region ?? "us";
  const bbox: number[] | undefined = body.bbox;
  const bboxFilter =
    Array.isArray(bbox) && bbox.length === 4 ? `(${bbox.map(Number).join(",")})` : "";
  // US-boundary filter is on by default; bbox-only is faster for testing.
  const useArea = body.useArea !== false;

  const query = useArea
    ? `[out:json][timeout:90];
area["ISO3166-1"="US"][admin_level=2]->.us;
nwr["surveillance:type"="ALPR"](area.us)${bboxFilter};
out center meta;`
    : `[out:json][timeout:90];
nwr["surveillance:type"="ALPR"]${bboxFilter};
out center meta;`;

  // Answer right away and keep working in the background, so the caller
  // (pg_net / cron) never hits the gateway's idle timeout.
  const work = async () => {
    const t0 = Date.now();
    let fetched = 0;
    let upserted = 0;
    try {
      const elements = await overpass(query);
      fetched = elements.length;
      const tFetch = Date.now() - t0;
      const rows = elements.map(toRow).filter(Boolean);
      for (let i = 0; i < rows.length; i += 1000) {
        const n = await rpc("upsert_osm_points", {
          p_rows: rows.slice(i, i + 1000),
          p_region: region,
        });
        upserted += Number(n) || 0;
      }
      await rpc("log_import_run", {
        p_region: region, p_fetched: fetched, p_upserted: upserted,
        p_error: null, p_note: `overpass ${tFetch} ms, total ${Date.now() - t0} ms`,
      });
    } catch (e) {
      await rpc("log_import_run", {
        p_region: region, p_fetched: fetched, p_upserted: upserted,
        p_error: String(e), p_note: `failed after ${Date.now() - t0} ms`,
      }).catch(() => {});
    }
  };

  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) {
    rt.waitUntil(work());
    return Response.json({ region, status: "started" }, { status: 202 });
  }
  await work();
  return Response.json({ region, status: "done" });
});
