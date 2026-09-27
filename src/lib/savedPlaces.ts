// Home, Work and recent destinations, kept only on this phone (iOS Keychain via
// expo-secure-store). Nothing here is sent to Overt's server.

import * as SecureStore from "expo-secure-store";
import type { Place } from "./geocode";

export type SavedPlace = Pick<Place, "id" | "name" | "subtitle" | "lat" | "lon">;
export type SavedPlaces = { home: SavedPlace | null; work: SavedPlace | null; recents: SavedPlace[] };

const KEY = "overt.places.v1";
const INTRO_KEY = "overt.introSeen.v1";
const MAX_RECENTS = 2;

export const EMPTY_PLACES: SavedPlaces = { home: null, work: null, recents: [] };

const slim = (p: Place | SavedPlace): SavedPlace => ({
  id: p.id,
  name: p.name.slice(0, 80),
  subtitle: p.subtitle.slice(0, 80),
  lat: Math.round(p.lat * 1e6) / 1e6,
  lon: Math.round(p.lon * 1e6) / 1e6,
});

export async function loadSavedPlaces(): Promise<SavedPlaces> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return EMPTY_PLACES;
    const v = JSON.parse(raw);
    return { home: v.home ?? null, work: v.work ?? null, recents: Array.isArray(v.recents) ? v.recents : [] };
  } catch {
    return EMPTY_PLACES;
  }
}

async function save(p: SavedPlaces) {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(p));
  } catch {
    // Not fatal: the places just won't survive a restart.
  }
}

const near = (a: SavedPlace, b: SavedPlace) => Math.abs(a.lat - b.lat) < 0.0005 && Math.abs(a.lon - b.lon) < 0.0005;

export function setSlot(p: SavedPlaces, slot: "home" | "work", place: Place | SavedPlace | null): SavedPlaces {
  const next = { ...p, [slot]: place ? slim(place) : null };
  save(next);
  return next;
}

/** Remember a destination (skips Home/Work and duplicates). */
export function addRecent(p: SavedPlaces, place: Place | SavedPlace): SavedPlaces {
  const s = slim(place);
  if ((p.home && near(p.home, s)) || (p.work && near(p.work, s))) return p;
  const recents = [s, ...p.recents.filter((r) => !near(r, s))].slice(0, MAX_RECENTS);
  const next = { ...p, recents };
  save(next);
  return next;
}

export function removeRecent(p: SavedPlaces, id: string): SavedPlaces {
  const next = { ...p, recents: p.recents.filter((r) => r.id !== id) };
  save(next);
  return next;
}

/** Forget every recent destination (Home and Work stay). */
export function clearRecents(p: SavedPlaces): SavedPlaces {
  const next = { ...p, recents: [] };
  save(next);
  return next;
}

export async function introSeen(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(INTRO_KEY)) === "1";
  } catch {
    return true;
  }
}

export async function markIntroSeen() {
  try {
    await SecureStore.setItemAsync(INTRO_KEY, "1");
  } catch {
    // ignore
  }
}
