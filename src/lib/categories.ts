// "Nearby" categories (gas, food, groceries…) from the Mapbox Search Box API.
// Only the map's centre and visible area are sent, never your trips.

import { getMapboxToken } from "./directions";
import type { Place } from "./geocode";

export type CategoryId = "gas" | "fast_food" | "restaurant" | "grocery" | "coffee" | "ev" | "parking" | "pharmacy";

export const CATEGORIES: { id: CategoryId; label: string; title: string; mapbox: string }[] = [
  { id: "gas", label: "Gas", title: "Gas stations", mapbox: "gas_station" },
  { id: "fast_food", label: "Fast food", title: "Fast food", mapbox: "fast_food" },
  { id: "restaurant", label: "Restaurants", title: "Restaurants", mapbox: "restaurant" },
  { id: "grocery", label: "Groceries", title: "Grocery stores", mapbox: "grocery" },
  { id: "coffee", label: "Coffee", title: "Coffee", mapbox: "coffee" },
  { id: "ev", label: "EV charging", title: "EV charging", mapbox: "charging_station" },
  { id: "parking", label: "Parking", title: "Parking", mapbox: "parking_lot" },
  { id: "pharmacy", label: "Pharmacy", title: "Pharmacies", mapbox: "pharmacy" },
];

export type CategoryPlace = Place & { category: CategoryId; distanceM: number | null };

export async function fetchCategory(
  cat: CategoryId,
  center: { lat: number; lon: number },
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  signal?: AbortSignal
): Promise<CategoryPlace[]> {
  const def = CATEGORIES.find((c) => c.id === cat)!;
  const token = await getMapboxToken();
  if (!token.startsWith("pk.")) throw new Error("Couldn't load the Mapbox settings.");
  const params = new URLSearchParams({
    access_token: token,
    proximity: `${center.lon.toFixed(5)},${center.lat.toFixed(5)}`,
    bbox: [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat].map((n) => n.toFixed(5)).join(","),
    limit: "25",
    language: "en",
    country: "US",
  });
  const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/category/${def.mapbox}?${params}`, { signal });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || `Search failed (${res.status})`);
  return ((json.features ?? []) as any[]).map((f, i) => {
    const p = f.properties ?? {};
    // Route to the entrance when Mapbox knows it.
    const rp = p.coordinates?.routable_points?.[0];
    const [lon, lat] = f.geometry.coordinates as [number, number];
    return {
      id: p.mapbox_id ?? `${cat}-${i}`,
      name: p.name ?? def.title,
      subtitle: [p.address, p.context?.place?.name].filter(Boolean).join(", "),
      lat: rp?.latitude ?? lat,
      lon: rp?.longitude ?? lon,
      category: cat,
      distanceM: typeof p.distance === "number" ? p.distance : null,
    };
  });
}
