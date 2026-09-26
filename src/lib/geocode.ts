// Free geocoding via Photon (https://photon.komoot.io), built on OpenStreetMap data.
// Fine for a prototype; the plan swaps in Mapbox Search before launch.

const PHOTON = "https://photon.komoot.io";
const HEADERS = { "User-Agent": "Overt/0.1 (prototype)" };

export type Place = {
  id: string;
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
  extent?: [number, number, number, number]; // minLon, maxLat, maxLon, minLat (Photon order)
};

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, any>;
};

function labelFor(p: Record<string, any>) {
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const name = p.name || street || p.city || p.county || p.state || "Unnamed place";
  const parts = [
    p.name && street ? street : null,
    p.city || p.town || p.village || p.district,
    p.state,
    p.countrycode && p.countrycode !== "US" ? p.country : null,
  ].filter((x, i, arr) => x && x !== name && arr.indexOf(x) === i);
  return { name, subtitle: parts.join(", ") };
}

export async function searchPlaces(
  query: string,
  near?: { lat: number; lon: number },
  signal?: AbortSignal
): Promise<Place[]> {
  const params = new URLSearchParams({ q: query, limit: "8", lang: "en" });
  if (near) {
    params.set("lat", near.lat.toFixed(4));
    params.set("lon", near.lon.toFixed(4));
  }
  const res = await fetch(`${PHOTON}/api/?${params}`, { headers: HEADERS, signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const json = (await res.json()) as { features: PhotonFeature[] };
  return json.features.map((f, i) => {
    const p = f.properties;
    const { name, subtitle } = labelFor(p);
    return {
      id: `${p.osm_type ?? "x"}${p.osm_id ?? i}`,
      name,
      subtitle,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      extent: p.extent,
    };
  });
}

/** "Near Elm St, Springfield" — used for a camera's approximate location. */
export async function describeLocation(lat: number, lon: number): Promise<string | null> {
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon), lang: "en", limit: "1" });
    const res = await fetch(`${PHOTON}/reverse?${params}`, { headers: HEADERS });
    if (!res.ok) return null;
    const json = (await res.json()) as { features: PhotonFeature[] };
    const p = json.features[0]?.properties;
    if (!p) return null;
    const street = p.street || (p.type === "street" ? p.name : null);
    const place = p.city || p.town || p.village || p.district || p.county;
    if (street && place) return `Near ${street}, ${place}`;
    if (street) return `Near ${street}`;
    if (place) return `In ${place}`;
    return null;
  } catch {
    return null;
  }
}
