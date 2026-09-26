import type { Region } from "react-native-maps";
import type { Bounds } from "./cameras";

/** Web-mercator style zoom level for a region shown `widthPt` points wide. */
export function zoomForRegion(region: Region, widthPt: number): number {
  const lonDelta = Math.max(region.longitudeDelta, 1e-6);
  return Math.log2((360 * (widthPt / 256)) / lonDelta);
}

/** Region bounds padded by `pad` (fraction of the span) on every side. */
export function boundsForRegion(region: Region, pad = 0.2): Bounds {
  const latSpan = region.latitudeDelta * (1 + pad * 2);
  const lonSpan = region.longitudeDelta * (1 + pad * 2);
  return {
    minLat: Math.max(-85, region.latitude - latSpan / 2),
    maxLat: Math.min(85, region.latitude + latSpan / 2),
    minLon: Math.max(-180, region.longitude - lonSpan / 2),
    maxLon: Math.min(180, region.longitude + lonSpan / 2),
  };
}

/** Metres covered by one screen point at this zoom and latitude. */
export function metersPerPoint(zoom: number, lat: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

/** Point `distance` metres from (lat, lon) along `bearing` degrees (0 = north). */
export function destination(lat: number, lon: number, bearing: number, distance: number) {
  const R = 6371008.8;
  const d = distance / R;
  const b = (bearing * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lon * Math.PI) / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { latitude: (p2 * 180) / Math.PI, longitude: (((l2 * 180) / Math.PI + 540) % 360) - 180 };
}

/** Polygon outline for a view cone: apex at the camera, arc `radius` metres out. */
export function conePolygon(lat: number, lon: number, bearing: number, radius: number, halfAngle = 20) {
  const pts = [{ latitude: lat, longitude: lon }];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const a = bearing - halfAngle + (2 * halfAngle * i) / steps;
    pts.push(destination(lat, lon, a, radius));
  }
  return pts;
}

const NAMES = [
  "North", "North-northeast", "Northeast", "East-northeast",
  "East", "East-southeast", "Southeast", "South-southeast",
  "South", "South-southwest", "Southwest", "West-southwest",
  "West", "West-northwest", "Northwest", "North-northwest",
];

export function compassName(deg: number): string {
  return NAMES[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

export function formatFacing(directions: number[]): string {
  if (!directions.length) return "Not recorded";
  return directions.map((d) => `${compassName(d)} (${d}°)`).join(" · ");
}

export function formatUpdated(iso: string | null): string {
  if (!iso) return "Unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  const abs = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  let rel: string;
  if (days < 1) rel = "today";
  else if (days < 2) rel = "yesterday";
  else if (days < 45) rel = `${days} days ago`;
  else if (days < 365 * 1.5) rel = `${Math.round(days / 30)} months ago`;
  else rel = `${Math.round(days / 365)} years ago`;
  return `${abs} · ${rel}`;
}
