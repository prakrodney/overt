// Home, Work and recent destinations, kept only on this phone (iOS Keychain via
// expo-secure-store). Nothing here is sent to Overt's server.

import * as SecureStore from "expo-secure-store";
import type { Place } from "./geocode";

export type SavedPlace = Pick<Place, "id" | "name" | "subtitle" | "lat" | "lon">;
/** A Pro saved place with your own name for it ("Gym", "Mom's house"). */
export type Favorite = SavedPlace & { label: string };
export type SavedPlaces = { home: SavedPlace | null; work: SavedPlace | null; recents: SavedPlace[]; favorites: Favorite[] };

const KEY = "overt.places.v1"; // Home / Work
const RECENTS_KEY = "overt.recents.v1"; // compact list, kept separate (Keychain values should stay under ~2 KB)
const FAVS_KEY = "overt.favorites.v1"; // compact list, separate for the same reason
const INTRO_KEY = "overt.introSeen.v1";
const MAX_RECENTS = 10;
export const MAX_FAVORITES = 8;

export const EMPTY_PLACES: SavedPlaces = { home: null, work: null, recents: [], favorites: [] };

const slim = (p: Place | SavedPlace): SavedPlace => ({
  id: p.id.slice(0, 32),
  name: p.name.slice(0, 60),
  subtitle: p.subtitle.slice(0, 50),
  lat: Math.round(p.lat * 1e6) / 1e6,
  lon: Math.round(p.lon * 1e6) / 1e6,
});

export async function loadSavedPlaces(): Promise<SavedPlaces> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const v = raw ? JSON.parse(raw) : {};
    const rraw = await SecureStore.getItemAsync(RECENTS_KEY).catch(() => null);
    const recents: SavedPlace[] = rraw
      ? (JSON.parse(rraw) as [string, string, string, number, number][]).map(([id, name, subtitle, lat, lon]) => ({
          id,
          name,
          subtitle,
          lat,
          lon,
        }))
      : Array.isArray(v.recents)
        ? v.recents // older app versions kept recents with Home / Work
        : [];
    const fraw = await SecureStore.getItemAsync(FAVS_KEY).catch(() => null);
    const favorites: Favorite[] = fraw
      ? (JSON.parse(fraw) as [string, string, string, number, number][]).map(([id, label, name, lat, lon]) => ({
          id,
          label,
          name,
          subtitle: "",
          lat,
          lon,
        }))
      : [];
    return { home: v.home ?? null, work: v.work ?? null, recents, favorites };
  } catch {
    return EMPTY_PLACES;
  }
}

async function save(p: SavedPlaces) {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify({ home: p.home, work: p.work }));
    await SecureStore.setItemAsync(
      RECENTS_KEY,
      JSON.stringify(p.recents.map((r) => [r.id, r.name, r.subtitle, r.lat, r.lon]))
    );
    await SecureStore.setItemAsync(
      FAVS_KEY,
      JSON.stringify(p.favorites.map((f) => [f.id, f.label, f.name, f.lat, f.lon]))
    );
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

/** Save a place under your own name (Pro). Replaces one with the same name or spot. */
export function addFavorite(p: SavedPlaces, place: Place | SavedPlace, label: string): SavedPlaces {
  const s = slim(place);
  const f: Favorite = { ...s, id: s.id.slice(0, 24), name: s.name.slice(0, 40), subtitle: "", label: label.trim().slice(0, 24) || s.name.slice(0, 24) };
  const rest = p.favorites.filter((x) => !near(x, s) && x.label.toLowerCase() !== f.label.toLowerCase());
  const next = { ...p, favorites: [...rest, f].slice(-MAX_FAVORITES) };
  save(next);
  return next;
}

export function renameFavorite(p: SavedPlaces, id: string, label: string): SavedPlaces {
  const next = {
    ...p,
    favorites: p.favorites.map((f) => (f.id === id ? { ...f, label: label.trim().slice(0, 24) || f.label } : f)),
  };
  save(next);
  return next;
}

export function removeFavorite(p: SavedPlaces, id: string): SavedPlaces {
  const next = { ...p, favorites: p.favorites.filter((f) => f.id !== id) };
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
