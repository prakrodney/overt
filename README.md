# Overt (app name: DeCam GPS)

The app shows up on phones as **DeCam GPS** (`app.json` → `name`, logo in `assets/icon.png`).
The code, repo, Supabase project and file names keep the working name **Overt**.

Navigation that shows you the surveillance around you. This is **milestone 1**: a
map-first iPhone prototype that shows every automated license plate reader (ALPR)
that's in OpenStreetMap, and runs in **Expo Go**.

## What's in milestone 1

| Feature | Where |
| --- | --- |
| Full-screen Apple Map that opens to your location, light and dark mode | `App.tsx` |
| Camera layer: loads only what's on screen, clustered when zoomed out | `src/lib/cameras.ts`, `get_camera_layer` in `supabase/migrations` |
| Slate camera markers and red view cones showing facing direction | `src/components/CameraMarkers.tsx` |
| Tap a marker for a bottom sheet (type, approximate location, facing, source, last updated) | `src/components/CameraSheet.tsx` |
| Search bar with a free geocoder ([Photon](https://photon.komoot.io), OpenStreetMap data) | `src/components/SearchBar.tsx`, `src/lib/geocode.ts` |
| Colors and type (Figtree) from the Overt screen designs | `src/theme.ts` |
| Report + confirm: **Report** button or long-press the map to add a camera; **Still there** / **Report an issue** on each camera (anonymous account, within 300 m) | `src/components/ReportSheet.tsx`, `src/components/CameraSheet.tsx`, `src/lib/reports.ts`, `src/lib/auth.ts` |
| Home sheet: **Where to?** with Home / Work (tap to set, long-press to change) and 2 recent places, all stored only on the phone; first-launch location explainer; app icon (`assets/icon.png`) | `src/components/WhereToSheet.tsx`, `src/components/LocationIntro.tsx`, `src/lib/savedPlaces.ts` |
| Route preview: tap a search result, then **Directions** for up to 3 Mapbox routes with ETA, distance, tolls and documented cameras on each | `src/lib/directions.ts`, `src/lib/routeCameras.ts`, `src/components/RouteSheet.tsx` |

## Run it on your iPhone

1. Install **Expo Go** from the App Store on your iPhone.
2. On your Windows PC, double-click **`Start Overt.bat`** in this folder.
   The first time, it installs Node.js (click **Yes** if Windows asks) and the app's packages.
3. When a QR code appears, open the iPhone **Camera** app, point it at the QR code and tap
   the **Open in Expo Go** banner.

Your phone and PC need to be on the same network (the PC's network must be set to **Private**).
**`Start Overt (tunnel).bat`** is a fallback, but Expo's tunnel is currently unreliable. The tunnel needs you signed in to a
free Expo account in two places: on the PC (double-click **`Sign in to Expo.bat`**) and in
the Expo Go app.

To put a copy on GitHub from your PC, double-click **`Upload to GitHub.bat`** (it installs Git
if needed and asks you to sign in to GitHub in your browser).

Developers: `npm install`, then `npx expo start --go`.

## Data

- **Source:** OpenStreetMap nodes tagged `surveillance:type=ALPR`, via the Overpass API.
  Camera data © OpenStreetMap contributors, available under the
  [ODbL](https://www.openstreetmap.org/copyright). The app shows this credit on the map.
- **Database:** Supabase Postgres + PostGIS, table `public.surveillance_points`.
  Row-level security lets the app read active points only; all writes go through the
  service role.
- **Import:** the database pulls OpenStreetMap itself. A `pg_cron` job
  (`osm-refresh-tick`) runs every minute. It processes Overpass responses that have
  arrived (via `pg_net`) and starts the next of 76 regions whose last good import is over
  20 hours old, with at most 2 requests in flight and mirrors rotated on failure. Rows are
  upserted on `(osm_type, osm_id)`, so re-runs never duplicate. Points outside a US
  boundary (geoBoundaries, padded ~300 m) are skipped. Progress is logged in
  `private.import_runs`.
- **Cleanup:** at 10:00 UTC daily, points missing from OpenStreetMap for 36 hours are
  archived, but only when every region has imported cleanly in that window.
- **Edge function:** `supabase/functions/import-osm` is kept for loading the US boundary
  (`{"action":"load-boundary"}`). It was the first importer, before imports moved into
  the database.
- **Facing:** parsed from `direction` / `camera:direction` (degrees, compass points like
  `NE`, ranges like `45-90`, or several values like `0;180`).

## Route previews and privacy

Routes come from the Mapbox Directions API (`driving-traffic`, with alternatives). The
Mapbox **public** (`pk.`) token is not stored in this repo: the app loads it at runtime from
Supabase (`get_public_config`, backed by `private.public_client_config`). To use a different
token locally, put `EXPO_PUBLIC_MAPBOX_TOKEN=pk....` in `.env.local` (see `.env.example`;
git ignores it). Cameras along each route are counted **on
the phone**: the app asks Supabase for the cameras inside a few coarse ~20 km boxes around
the routes (`get_cameras_in_boxes`) and measures which are within 30 m of each line. The
route itself is never sent to Overt's server. A camera with a known facing only counts
when the route runs along its view (within 50° of that axis), so an overpass camera looking
across a freeway doesn't count for the freeway. If every route passes a camera, the app
asks Mapbox for a **detour** that routes around those cameras (`exclude=point(...)` on the
spot of the route nearest each camera, so it blocks the road actually driven; up to 50 points,
up to 6 tries) and adds it as an extra card when it passes fewer
(`src/lib/fewerCameras.ts`). Turn-by-turn navigation needs the Mapbox
Navigation SDK, which can't run inside Expo Go, so **Start** shows a note for now.

## Community reports

Each phone signs in with an anonymous Supabase account (Supabase → Authentication → **Allow
anonymous sign-ins** must be on). People can confirm a camera (**Still there**), say it's
gone, flag wrong location/details, or report new equipment. The server checks you're within
300 m (your location is used for that check only; the report stores the camera's location),
allows one vote per camera per day, and allows **one new camera per person per day**. Confidence and reporter
trust are recomputed on every vote (`private.recompute_confidence`). Review flagged reports
in the SQL editor: `select * from private.moderation_queue;` then
`select private.moderate_report(<id>, 'accepted' | 'rejected');`.

## Project layout

```
App.tsx                      map screen
src/theme.ts                 light/dark color tokens + fonts
src/config.ts                Supabase URL + publishable key
src/lib/                     camera API, geocoder, geometry helpers
src/components/              markers, sheet, search bar, icons
supabase/migrations/         schema, camera-layer query, import plumbing, cron
supabase/functions/import-osm  OpenStreetMap importer (Deno)
scripts/                     Windows helpers used by the .bat files
```

## Not in this milestone

Turn-by-turn navigation (and the post-trip "Still there?" prompt), Sign in with Apple and
payments are planned for later milestones (see the product plan). Search uses Photon
for now; the plan swaps in Mapbox Search before launch.
