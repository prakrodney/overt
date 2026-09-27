# Overt: project handoff

> **App name:** the app is now called **DeCam GPS** on phones (app.json name, logo in assets/icon.png from the owner's image). Code, repo, Supabase and file names stay "Overt".
> **Speed cameras (migration 0014):** importer also fetches `node[highway=speed_camera]` (category `speed_camera`); layer clusters per category; `get_cameras_in_boxes` rows gain a 5th element (1 = speed camera); route ratings and detours count plate readers only, speed cameras shown separately; `report_new_point` gained `p_category`. The 0014 migration was applied as in-place text replacements of the live importer functions (the file has the full resulting definitions).
> **Road alerts (migration 0015):** `public.road_alerts` (police/crash/hazard, 1 h expiry), RPCs `get_road_alerts` (anon), `report_road_alert`, `vote_road_alert`; cron `road-alerts-cleanup` deletes rows a day after expiry. Limits (0016): 3 alerts/hour and 10/day per account via `private.road_alert_log`; duplicate reports and "Still there" restart the hour (never stack), max 3 h per alert; 20 votes/hour.
> **Live drivers:** built (0017/0018) then removed at the owner's request (0019 drops the table, functions and cron job). No avatar/character code remains.
> **Free vs Pro (client-side for now):** `src/lib/pro.ts` (3-day trial stored on the phone, admins = Pro, `previewFree` toggle), `Paywall.tsx`. Gated: seeing police alerts (crash/object alerts and all reporting are free), speed cameras (map, route counts, spoken heads-up, reporting), voice. TODO at App Store build: StoreKit/RevenueCat subscription ($9.99/mo with 3-day intro offer), then enforce on the server (e.g. `get_road_alerts` / speed cameras check an entitlements table fed by RevenueCat webhooks).
> **Admin review (migration 0013):** in-app Review screen for admins; the owner's phone becomes admin by typing a one-time code (hash in `private.admin_codes`, admins in `private.admins`) into the search bar. If his anonymous account is ever lost, generate a new code.

_Last updated: 2026-09-26, ~09:25 UTC. Written for the next Claude session. Read this first,
then `README.md`._

## 1. Who and what

- **Owner:** rodney (GitHub `prakrodney`). Not a developer: explain anything he needs to click in
  plain language, and do setup work for him wherever the tools allow. He works on a **Windows PC**
  (project folder `C:\Users\rodne\OneDrive\Desktop\Overt Project`) and tests on an **iPhone
  with Expo Go**.
- **Product:** **Overt** (store name "Overt Maps", pending a trademark check). A privacy-focused,
  everyday navigation app that shows automated license plate reader (ALPR) cameras on the map.
  Positioning: *"Navigation that shows you the surveillance around you."* It's framed as neutral
  and informational, not as evasion.
- **Source documents** (read-only references):
  - Product & technical plan (Claude Doc): https://claude.ai/code/artifact/8a1cfbbd-68cc-4a9c-92e6-1df06f95dd15
  - Screen designs (Design canvas; Home, Marker, Route and Navigation boards, light and dark): https://claude.ai/artifact/DRQGCVfUW8z5rb7iq5xAZ6
- **Repo:** https://github.com/prakrodney/overt (private). Branch `main`; GitHub currently has
  `bb3c830`.

### Plan summary (what "done" looks like for the MVP)
The MVP has five features, all polished:
1. Map + search
2. Turn-by-turn navigation
3. Surveillance layer with confidence badges (Verified / Community reported / Needs confirmation)
4. **Route transparency:** "N documented ALPRs on this route" next to each route's ETA
5. **Report + confirm loop:** reporting takes 3 taps; after a trip, "Still there?" for up to 3
   cameras you passed

Deliberately cut from the MVP: required accounts (anonymous by default), payments (hooks only),
offline maps, CarPlay, social features, and "avoid cameras" routing as a headline feature.

Privacy principles: no trip history on the server, reports store the **equipment** location and
never the user's path, and minimal analytics.

Business model (later): RevenueCat subscription "Plus". Data and contributing stay free forever.

## 2. Architecture (as built)

```
iPhone (Expo Go, SDK 57, React Native 0.86, TypeScript)
 ├─ Apple Maps via react-native-maps (mapType mutedStandard, light/dark via userInterfaceStyle)
 ├─ Supabase REST (plain fetch, no supabase-js)
 │    ├─ rpc/get_camera_layer        viewport points or grid clusters (anon)
 │    ├─ rpc/get_cameras_in_boxes    cameras in coarse ~20 km boxes for route counting (anon)
 │    ├─ rpc/get_public_config       returns { mapbox_token } (public pk. token) (anon)
 │    └─ [WIP] auth/v1 anonymous sign-up + rpc/vote_on_point, report_new_point, report_issue
 ├─ Photon geocoder (photon.komoot.io): search autocomplete + reverse geocode ("Near X St")
 └─ Mapbox Directions API (driving-traffic, alternatives, geojson, steps for toll detection)

Supabase project "prakrodney@gmail.com's Project" (ref xghyzucbbzfdzqrjoyvf, us-east-1, PG 17)
 ├─ PostGIS table public.surveillance_points (~102k US ALPRs from OpenStreetMap)
 ├─ pg_cron "osm-refresh-tick" every minute → private.refresh_tick()
 │    pg_net GET → Overpass mirrors → parse JSON in SQL → public.upsert_osm_points()
 ├─ pg_cron "osm-archive-stale" 10:00 UTC → private.archive_stale_osm_points()
 └─ Edge function import-osm (only used to load the US boundary now; legacy importer)
```

- **Fewer-cameras detour** (`src/lib/fewerCameras.ts`): when every Mapbox route passes ≥1
  camera, re-request with `exclude=point(lon lat)` for those cameras (≤50, up to 4
  iterations), add the result as an extra "Detour" card if it passes fewer cameras and
  takes ≤ 2× the fastest + 10 min. Counting is direction-aware: a camera with a known
  facing counts only if the route segment is within 50° of its view axis.
- **Route camera counting happens on the phone.** The app sends only coarse boxes, never the
  route. A camera counts if it's within **30 m** of the route line (`src/lib/routeCameras.ts`).
- **Clustering is server-side:** `ST_SnapToGrid` with ~60 pt cells below zoom 15, individual
  points (limit 2000) at zoom ≥ 15. Single-point cells come back as full points.
- **Direction cones** are map-space `Polygon`s (±20°, radius = 36 pt at the current zoom, 76 pt
  when selected), shown at zoom ≥ 13.

## 3. Database schema (public + private)

**`public.surveillance_points`**: id (identity), geom geometry(Point,4326) + GIST index,
category ('alpr'), subtype, manufacturer, operator, mount, direction_raw, directions_deg
smallint[], direction_deg (generated = directions_deg[1]), status ('active'|'archived'),
confidence_score 0–100, confidence_level ('verified'|'community'|'needs_confirmation'),
source ('osm'|'community'), osm_type, osm_id (unique with osm_type), osm_version,
osm_updated_at, last_verified_at, last_seen_in_import_at, tags jsonb, created_at, updated_at,
**+ (migration 9)** confirm_count, gone_count, last_confirmed_at, reported_by uuid.
RLS: anon/authenticated can SELECT where status = 'active'. No client writes.

**`public.reporters`** (migration 9): user_id → auth.users, trust_score (default 10), created_at.
RLS: users can read their own row.

**`public.reports`** (migration 9): id, point_id, user_id, type
('new'|'confirm'|'gone'|'wrong_location'|'details_wrong'|'other'), geom (the equipment's
location), reporter_distance_m, payload jsonb, status ('pending'|'accepted'|'rejected'),
created_at. RLS: users can read their own reports. All writes go through security-definer
functions.

**Public functions**
| Function | Who | Purpose |
| --- | --- | --- |
| `get_camera_layer(min_lon,min_lat,max_lon,max_lat,zoom)` | anon | `{mode, points[], clusters[]}` for the viewport |
| `_camera_point_json(point)` | internal | JSON shape the app reads (includes `confirm_count` since migration 9) |
| `get_cameras_in_boxes(boxes jsonb, max_count)` | anon | `[[id,lat,lon,dir],…]` inside up to 200 boxes |
| `get_public_config()` | anon | `{ "mapbox_token": "pk…" }` from `private.public_client_config` |
| `vote_on_point(id, 'confirm'\|'gone', user_lat, user_lon)` | authenticated | ≤300 m check, 1 vote/person/point/24 h, 50 actions/day, recomputes confidence |
| `report_new_point(lat, lon, direction_deg, user_lat, user_lon)` | authenticated | ≤300 m, US only, **1 new camera per person per 24 h** (migration 0011), merges into an existing point within 25 m (counts as a confirm) |
| `report_issue(id, kind, note)` | authenticated | Goes to the moderation queue (status pending) |
| `upsert_osm_points(rows, region)` | service_role | Import upsert; skips non-US points; keeps community-archived points archived |
| `verify_import_secret`, `log_import_run`, `load_us_boundary` | service_role | Edge-function plumbing |

**Private schema** (not exposed via the API): `import_config` (secret, function_url),
`import_runs` (import log), `import_regions` (**76** bbox regions: 72 CONUS quarter-tiles plus
Alaska, Aleutians-west, Hawaii and Puerto Rico/USVI), `overpass_mirrors`, `pending_fetches`,
`us_boundary_parts` (geoBoundaries USA ADM0, subdivided, padded 0.003°), `public_client_config`.
Functions: `in_us`, `parse_directions`, `start_region_fetch`, `process_fetches`,
`refresh_tick`, `archive_stale_osm_points`, `archive_points_outside_us`, `queue_boundary_load`,
`recompute_confidence`, `require_reporter`, `distance_m`, `moderate_report`, and the view
`moderation_queue`.

**Confidence model** (`private.recompute_confidence`): base score is 55 for OSM, or
25 + trust/5 for community points. Add up to 3 trust-weighted confirmations × 15, subtract gone
votes × 20, add 10 if confirmed in the last 180 days, subtract 15 if never confirmed and stale for
over 12 months. Score ≥ 70 is Verified, 40–69 Community reported, < 40 Needs confirmation.
2+ independent "gone" votes that outweigh confirmations archive the point. Reporter trust
rises when others confirm their reports and falls when they're voted gone.

**Migrations** live in `supabase/migrations/20260926000001…11`, all applied to the live
project. Note: some one-off SQL was also run directly (setting `import_config.function_url`,
the ad-hoc first-import helpers that migration 6 dropped, inserting the Mapbox token). The live
database therefore matches the migration files plus that data.

## 4. What's built and working

- Full-screen Apple Map that opens to your location, with a recenter button and ODbL attribution
  ("Camera data © OpenStreetMap contributors").
- Camera layer that loads only the visible area, with numbered clusters and slate camera
  markers matching the designs (solid; dashed and faded for "needs confirmation") and red
  facing cones.
- Camera detail bottom sheet (swipe down to close): overline "SURVEILLANCE · ALPR", title,
  confidence badge, then Type (manufacturer, with "Unknown" hidden), Location ("Near X St, City
  (approx.)" via Photon reverse geocoding), Facing (compass + degrees), Operator, Source, Last
  updated, and a "View on OpenStreetMap" button.
- Search with Photon autocomplete (biased to the user's location). Picking a result shows a
  place sheet (name, address, distance) with a **Directions** button.
- **Route preview:** up to 3 Mapbox routes (selected one in accent color, others grey, each with
  a casing), a from/to header card, and route cards with ETA, miles, "Toll road" and camera
  count, plus badges Safest / Mixed / Unsafe (relative camera counts, wording from the design).
  Also an **Avoid tolls** toggle. **Start** shows a note because turn-by-turn needs a native
  build.
- Light/dark theme from the designs (`src/theme.ts`), Figtree font
  (`@expo-google-fonts/figtree`).
- OSM import pipeline: rolling daily refresh, US-boundary filter, mirror rotation, no duplicates.
- Windows helper `.bat` files for a non-technical user (see §7).

**Verified:** `tsc --noEmit` passes, `expo export --platform ios` bundles, the sheets were
screenshotted via a react-native-web harness in light and dark, real Mapbox and Supabase calls
were tested, and the reporting SQL was tested in a rolled-back transaction (distance limit,
repeat vote, confirm → verified, 2× gone → archived, duplicate report merged, trust drops,
moderation queue).

## 5. Report + confirm loop (status)

**Update:** the app side is now wired: Still there / Report an issue (ActionSheet: gone,
wrong spot, wrong details) on the camera sheet with "Last verified" and "Confirmations" rows;
**Report** pill button + long-press → placement pin at map centre → ReportSheet (type, optional
facing) → `report_new_point`; toasts; the map reloads after changes. Type-checked, iOS bundle
builds, sheets screenshotted in light/dark. Anonymous sign-ins were turned on 2026-09-26 ~09:35 UTC and the full REST path
(sign up → vote_on_point) was verified; migration 0010 made "too far" messages use ft/miles.
Next: test on the phone near a real camera.

### Original notes

**Feature: report + confirm loop.** The backend is done and live (migration 9). The frontend is
partly written and **not wired into the UI yet**:
- `src/lib/auth.ts`: anonymous Supabase session stored in the Keychain via `expo-secure-store`,
  with auto refresh; `rpcAuthed(fn, args)`.
- `src/lib/reports.ts`: `voteOnPoint`, `reportNewPoint`, `reportIssue`. These fetch a high-accuracy
  location to send for the 300 m check.
- `expo-secure-store` was added to package.json and app.json plugins.

**(Resolved)** anonymous sign-ins were **disabled** in the Supabase project (the auth signup
returned `anonymous_provider_disabled`). The owner was asked to turn it on under Supabase
Dashboard → Authentication → Sign In / Providers → **Allow anonymous sign-ins** → Save. He hasn't
confirmed yet. The MCP connector can't change auth settings. Check it with:
`curl -X POST https://xghyzucbbzfdzqrjoyvf.supabase.co/auth/v1/signup -H "apikey: <publishable>" -H "Content-Type: application/json" -d '{}'`

## 6. Exact next steps

1. **Confirm anonymous sign-ins are on** (curl above should return an access_token), then
   test on the phone near a real camera.
2. ~~Wire up the camera sheet~~ (done) (`src/components/CameraSheet.tsx`), matching the Marker board:
   - add rows "Last verified" (from `last_verified_at`) and "Confirmations" ("N people", from
     `confirm_count`; add `confirm_count` to the `CameraPoint` type in `src/lib/cameras.ts`);
   - add a two-button row at the bottom: **Still there** (primary, accent) and **Report an issue**
     (outlined). "Report an issue" opens an `ActionSheetIOS` with *It's gone*, *Wrong location*,
     *Details are wrong*, *Cancel*. *It's gone* calls `voteOnPoint(id,'gone')`; the others call
     `reportIssue`;
   - show a success/error toast with the server's message (the SQL raises friendly text); after
     a vote, refresh the camera layer and update the badge.
3. ~~Report flow~~ (done) (plan: 3 taps): a **Report** pill button (design: bottom-right, white,
   "＋ Report") plus long-press on the map. It enters placing mode: a fixed center crosshair pin,
   a banner "Move the map to place the camera", and a sheet with type (ALPR), optional facing
   chips (N…NW / Not sure) and **Submit** → `reportNewPoint(center.lat, center.lon, dir)`. On
   success, show a toast "Thanks, others nearby will confirm it," then reload the layer. The new
   point shows as a dashed "Needs confirmation" marker. Handle `merged_into` ("Already on the
   map, counted as a confirmation").
4. Type-check, `expo export --platform ios`, web-harness screenshots of the new sheet states,
   then a real test on the phone (the owner must physically be within 300 m of a camera to
   confirm one).
5. Commit, sync to the owner's folder, and have him run **Upload to GitHub.bat** (see §8).
6. Then, in the plan's order: the Home "Where to?" sheet (Home/Work saved places, recents) and a
   first-launch location explainer; then a native dev build (EAS, needs an Apple Developer
   account at $99/yr) for turn-by-turn navigation (Mapbox Navigation SDK v3 via a native
   module) and the post-trip "Still there?" prompt; later, Sign in with Apple to keep reports
   across devices, and RevenueCat.

## 7. How the owner runs things (Windows, non-technical)

Files in the project folder:
- **Start Overt.bat**: installs Node via winget if missing, runs `npm install` when the lockfile
  changes, then `npx expo start --go --lan`. **His LAN connection didn't work** (the phone never
  reached the PC at 192.168.1.150:8081; likely firewall or router), so he uses the next file.
- **Start Overt (tunnel).bat**: the same with `--tunnel` (`@expo/ngrok` is a devDependency).
  Tunnel mode requires him to be **signed in to Expo** on both the PC and in Expo Go (account
  `prakrodney`).
- **Sign in to Expo.bat**: runs `npx expo login` then `npx expo whoami`.
- **Upload to GitHub.bat** → `scripts/push-to-github.ps1`: installs Git via winget if needed.
  The first time, it builds `.git` from `scripts/overt.bundle`. On later runs it adopts newer
  history from the bundle (fast-forward, or reset if the bundle builds on `origin/main`), then
  commits any leftover changes as "Update from my PC" and pushes (Git Credential Manager handles
  browser sign-in).
- Code changes reach the phone through Expo Fast Refresh if the tunnel window is open. Otherwise
  he shakes the phone and taps **Reload**.

## 8. How Claude has been working (environment facts)

- **Cloud workspace:** the repo lives at `/home/claude/overt`. npm works only if you run
  `export NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1 npm_config_noproxy=localhost`
  first (the default noproxy sends npm around the egress proxy and it gets a 403).
- **The cloud can't push to GitHub:** the git proxy only authorizes session-bound repos, and
  `prakrodney/overt` isn't one. Reading (`git ls-remote`) works. Workflow: commit in the cloud, then
  `git bundle create overt.bundle main`, copy changed files plus `scripts/overt.bundle` into the
  owner's folder with `device_commit_files` (≤50 files per call; `.git` and `.env*` files are
  refused), verify by comparing sha256 hashes with `device_bash`, then have the owner run
  **Upload to GitHub.bat**. Keep `.ps1`/`.bat` files as **CRLF**. OneDrive has once reverted a just-written file, so
  always re-check the hashes.
- **The device shell** (`device_bash`, Linux VM on his PC) has **no internet**, but it can see
  the folder at `$HOME/mnt/Overt Project` and reach the PC's LAN IP. Delete permission for the
  folder was granted in this session only.
- **Computer use:** only click-tier on Explorer, cmd, PowerShell and Terminal (no typing). Grants
  expire after 30 minutes of inactivity.
- **Supabase** is reached through the Supabase MCP connector (execute_sql, apply_migration,
  deploy_edge_function). The cloud can also call `https://xghyzucbbzfdzqrjoyvf.supabase.co` directly.
- **Overpass is unreachable from the cloud** (the proxy drops long requests), and from edge
  functions the main server answers HTTP 406. That's why imports run inside Postgres via `pg_net`.
- **GitHub push protection** flags Mapbox `pk.` tokens as secrets. Never commit a token. The
  token lives in `private.public_client_config`, and `.env.local` (git-ignored) is an optional
  override via `EXPO_PUBLIC_MAPBOX_TOKEN`.

## 9. Configuration and "environment variables"

| Name | Where | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | `src/config.ts` | `https://xghyzucbbzfdzqrjoyvf.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | `src/config.ts` | `sb_publishable_…`; meant to ship in the app; send only as the `apikey` header |
| Mapbox public token | Supabase `private.public_client_config` (key `mapbox_token`) | Served by `get_public_config()`; the owner's Mapbox account is `prakrodney` |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | optional `.env.local` (git-ignored; see `.env.example`) | Local override only |
| Import secret | `private.import_config.secret` | Only for the legacy edge function; never expose |
| Edge function env | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Provided by Supabase automatically |

There's no service-role key or `sk.` token anywhere in the app or repo, and it should stay that way.

## 10. Data status and known issues

- **Import:** at 09:22 UTC, 46 of 76 regions were done, with **102,635 active cameras** and 8
  archived (outside the US). There are no duplicate `(osm_type, osm_id)` pairs. The import
  continues automatically at about 1 region/minute plus retries; check progress with:
  ```sql
  select count(*) filter (where ok) done, count(*) total from (
    select exists (select 1 from private.import_runs x where x.region = ir.region and x.error is null
                   and x.finished_at > '2026-09-26 08:15+00') ok from private.import_regions ir) s;
  ```
- 236 spots have 2+ distinct OSM entries at identical coordinates (162 with the same direction,
  probably duplicates within OSM itself). They're left as-is; possible future cleanup.
- The main Overpass server sometimes returns 504 ("too busy"), and the mirrors time out.
  `refresh_tick` retries each failed region after 4 minutes, rotating through 3 mirrors. Watch
  `private.import_runs` for regions that keep failing.
- The daily archive job only archives when all 76 regions have imported cleanly within 36
  hours, so it's safe but might never run if one region keeps failing.
- LAN mode doesn't reach his phone; he uses tunnel mode, which requires the Expo login.
- **Start** (turn-by-turn) isn't possible in Expo Go.
- The Safest/Mixed/Unsafe wording comes from the design, but the plan prefers neutral framing.
  It's a one-line change in `RouteSheet.tsx` if he wants it.
- The edge function `import-osm` still has an Overpass importer path, which is now unused.
- **Legal flags from the plan** (not advice): run a trademark check on "Overt", and have a
  lawyer review the ODbL share-alike question before launch. The app must keep the
  "© OpenStreetMap contributors" credit.
- When the owner runs a Windows `.bat`, a "module blocked from loading into the Local Security
  Authority" notice appeared once. It's unrelated to Overt; he was told not to disable LSA
  protection.

## 11. File structure

```
App.tsx                         map screen: camera layer, search, place sheet, route mode
index.ts                        registerRootComponent
app.json                        name Overt, bundle id com.overtmaps.app, location permission text, plugins
package.json                    Expo SDK 57 deps (+ @expo/ngrok dev, expo-secure-store)
src/config.ts                   Supabase URL + publishable key; optional Mapbox override from env
src/theme.ts                    light/dark tokens from the designs (markers, cones, routes, badges)
src/components/
  CameraMarkers.tsx             CameraMarker, ClusterMarker, DirectionCones
  CameraSheet.tsx               camera details bottom sheet  ← next: Still there / Report an issue
  SearchBar.tsx                 Photon autocomplete pill
  PlaceSheet.tsx                search result sheet with Directions
  RouteSheet.tsx                RouteSheet (route cards) + RouteHeader (from/to card)
  Icons.tsx, Txt.tsx            SVG icons; Figtree text wrapper
src/lib/
  cameras.ts                    get_camera_layer client + types
  geocode.ts                    Photon search + reverse ("Near X St, City")
  geo.ts                        zoom/bounds math, cone polygons, compass names, date formatting
  directions.ts                 Mapbox Directions (token from get_public_config)
  routeCameras.ts               on-device camera counting along routes (30 m)
  auth.ts                       [WIP] anonymous session + rpcAuthed
  reports.ts                    [WIP] voteOnPoint / reportNewPoint / reportIssue
supabase/migrations/            0001–0009 (see §3)
supabase/functions/import-osm/  Deno edge function (US boundary loader; legacy importer)
scripts/                        start-overt.ps1, push-to-github.ps1, overt.bundle (git history)
*.bat                           Windows helpers for the owner
README.md                       run instructions, data pipeline, privacy notes
HANDOFF.md                      this file
```
