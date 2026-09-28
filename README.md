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
| Speed cameras (OSM `highway=speed_camera`): amber markers and dots, own sheet title and speed limit, counted separately on routes, reportable | `category = 'speed_camera'`, migration 0014 |
| Speedometer: GPS speed in mph (top-left) while driving; hides after a minute stopped | `src/components/Speedometer.tsx` |
| Live road alerts: **Report** → Police / Crash / Object on road, placed at your spot; last 1 hour (a duplicate report restarts the hour, never adds; 3 h max; the app doesn't show the time limit), **Still there / Not there** on the alert sheet, plus a pop-up asking "Still there?" right after you drive past one (free; 1 question / 2 min; Settings toggle; not for cameras); removed by 2 "Not there" (or the reporter); 3 alerts/hour, 10/day per person; deleted a day after expiry | `src/components/RoadAlerts.tsx`, `src/lib/roadAlerts.ts`, migration 0015 |
| Nearby categories: chips under the search bar (Gas, Fast food, Restaurants, Groceries, Coffee, EV charging, Parking, Pharmacy) → pins + list for the visible area, tap for Directions (Mapbox Search Box category API; only the map centre/area is sent) | `src/components/Categories.tsx`, `src/lib/categories.ts` |
| Turn-by-turn (Expo Go version): **Start** on a route → next-turn banner, spoken directions (iPhone voices via expo-speech; best installed en-US voice), spoken heads-up for plate readers/speed cameras/road alerts ~400 m ahead, map follows you in a tilted driver's view (pitch 55°, looking ahead, 3D buildings), tap the top banner (or swipe up the bottom panel) for every direction, **Overview** button zooms out to the whole trip and **Re-center** goes back, with a stop pending the stretch to it is teal (then the usual blue), rerouting when off the line or when you add a stop (full search for a 0-plate-reader route, any extra time; if none exists it says how many the new route passes), screen stays awake, mute. App must stay open. | `src/lib/navEngine.ts`, `src/lib/voice.ts`, `src/components/Navigation.tsx` |
| Settings (gear in the search bar): Appearance Automatic / Light / Dark (saved on the phone), Voice guidance on/off. Speaker button under the locate button mutes/unmutes voice from the map | `src/components/SettingsSheet.tsx`, `src/theme.ts` |
| Free vs Pro: Free = plate-reader map, routes/detours (every search also looks hard for a route with 0 plate readers, any extra time, listed first as Safest; no on/off box), on-screen directions, search, saved places, camera reports, crash + road-object alerts (see + report), reporting police. Pro ($9.99/month, 3-day free trial) = seeing police alerts, speed + red-light cameras, voice guidance, drive-mode alerts (no route), adding a stop during a trip (swipe up the trip panel › Add a stop), weekly privacy report (on-phone), map styles. Free users see a "N police nearby · PRO" hint. In Expo Go, Pro comes from the on-phone trial or an admin account (admins can preview the free version in Settings); real subscriptions need the App Store build | `src/lib/pro.ts`, `src/components/Paywall.tsx` |
| More (migrations 0021–0022): **speed limit sign** beside the speedometer while navigating (Mapbox maxspeed; dial turns red 5+ mph over; Pro spoken "Speed limit 45" at most every 2 min) · admins review cameras voted gone from the camera sheet (Keep → needs 2 *new* gone votes to hide again, Remove → archived for good) · **Avoid highways** chip (free) · Pro **Leave later** (Mapbox `depart_at`), **Add stop** (up to 3 waypoints; snapped stop points trimmed as you reach them), **saved places** (up to 8 named favorites, on the phone), **lane guidance** arrows in the banner, **camera density map** (grid of plate readers per area, `get_camera_density`) · **Share ETA** button while navigating (free; plain text + Apple Maps link, no live tracking) · **Invite a friend** (6-letter code, both get a free Pro week; one code per account, max 10 reward weeks per inviter, 3 uses per code per day) · **Your badges** (counts from `my_contributions`) | `src/components/Community.tsx`, `src/lib/community.ts`, `src/components/Speedometer.tsx`, `src/components/RouteSheet.tsx` |
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
(`src/lib/fewerCameras.ts`). **Start** runs the built-in turn-by-turn guidance (see the feature table); the Mapbox Navigation SDK (lock-screen guidance, CarPlay) needs a native build.

## Community reports

Each phone signs in with an anonymous Supabase account (Supabase → Authentication → **Allow
anonymous sign-ins** must be on). People can confirm a camera (**Still there**), say it's
gone, flag wrong location/details, or report new equipment. The server checks you're within
300 m (your location is used for that check only; the report stores the camera's location),
allows one vote per camera per day, and allows **one new camera per person per day**. Confidence and reporter
trust are recomputed on every vote (`private.recompute_confidence`). Flagged reports (new cameras from low-trust reporters, and "Report an issue" flags) are
reviewed **in the app**: an admin phone shows a **Review** button with the waiting count
(`src/components/ReviewScreen.tsx`, `public.admin_*` in migration 0013). A phone becomes an
admin by typing a one-time code into the search bar and pressing Search. Make a new code in
the SQL editor with
`insert into private.admin_codes (code_hash) values (encode(extensions.digest('decam-admin-<random>', 'sha256'), 'hex'));`.
Cameras removed there stay removed even if OpenStreetMap still lists them.

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
