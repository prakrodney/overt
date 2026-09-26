// Supabase project the app reads cameras from.
// The publishable key is meant to ship inside apps: row-level security only
// lets it read active camera points and call the camera-layer query.
export const SUPABASE_URL = "https://xghyzucbbzfdzqrjoyvf.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_kHQGBA-LorIyWYNW1WyleQ_GgbDeg7C";

// Mapbox public token (starts with "pk."), used for route previews.
// Kept out of git: the app loads it at runtime from Supabase
// (public.get_public_config). A developer can override it locally with
// EXPO_PUBLIC_MAPBOX_TOKEN=pk.... in .env.local.
export const MAPBOX_TOKEN_OVERRIDE = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
