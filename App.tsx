import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/figtree";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionSheetIOS, Alert, AppState, Keyboard, Pressable, Share, StyleSheet, useWindowDimensions, View } from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraMarker, ClusterMarker, DirectionCones } from "./src/components/CameraMarkers";
import { CameraSheet } from "./src/components/CameraSheet";
import { CloseIcon, GearIcon, LocateIcon, PlusIcon, PoliceIcon } from "./src/components/Icons";
import { LocationIntro } from "./src/components/LocationIntro";
import { ReviewScreen } from "./src/components/ReviewScreen";
import { PlacementPin, ReportSheet } from "./src/components/ReportSheet";
import { PlaceSheet } from "./src/components/PlaceSheet";
import { RouteHeader, RouteSheet, timeLabel } from "./src/components/RouteSheet";
import {
  BadgesSheet,
  DensityIcon,
  DensityLayer,
  DensityLegend,
  InviteSheet,
  StillHerePrompt,
} from "./src/components/Community";
import { fetchDensity, refreshGift, type DensityCell } from "./src/lib/community";
import { SearchBar } from "./src/components/SearchBar";
import { WhereToSheet } from "./src/components/WhereToSheet";
import { RoadAlertMarker, RoadAlertSheet } from "./src/components/RoadAlerts";
import { CategoryChips, CategoryPin, CategorySheet } from "./src/components/Categories";
import { fetchCategory, type CategoryId, type CategoryPlace } from "./src/lib/categories";
import { NavBanner, NavPanel, RecenterPill, SpeakerIcon } from "./src/components/Navigation";
import { SettingsSheet } from "./src/components/SettingsSheet";
import { Paywall } from "./src/components/Paywall";
import { PrivacyReportSheet } from "./src/components/PrivacyReport";
import {
  CAM_LABEL,
  DriveWatcher,
  feetText,
  fetchNearbyCams,
  metersBetween,
  PassTracker,
  type AheadItem,
} from "./src/lib/driveAlerts";
import { recordPassed, recordTrip } from "./src/lib/privacyReport";
import { checkCommute, type CommuteStatus } from "./src/lib/commuteWatch";
import { usePrefs } from "./src/lib/prefs";
import type { Cam } from "./src/lib/routeCameras";
import { setAdminPro, usePro } from "./src/lib/pro";
import { isEnforcement } from "./src/lib/cameras";
import { arrivalTime, NavEngine, type Hazard, type NavUpdate } from "./src/lib/navEngine";
import { loadMuted, say, setMuted as setVoiceMuted, stopSpeaking } from "./src/lib/voice";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { ALERT_LABEL, fetchRoadAlerts, reportRoadAlert, type RoadAlert, type RoadAlertType } from "./src/lib/roadAlerts";
import { SPEEDING_MARGIN, Speedometer, useSpeed } from "./src/components/Speedometer";
import { Txt } from "./src/components/Txt";
import { fetchCameraLayer, type CameraCluster, type CameraLayer, type CameraPoint } from "./src/lib/cameras";
import type { Place } from "./src/lib/geocode";
import { fetchRoutes, type RouteOption } from "./src/lib/directions";
import { camerasAlongRoutesDetailed } from "./src/lib/routeCameras";
import { findFewerCamerasRoute } from "./src/lib/fewerCameras";
import { reportNewPoint, voteOnPoint } from "./src/lib/reports";
import { adminStatus, claimAdmin } from "./src/lib/admin";
import { boundsForRegion, zoomForRegion } from "./src/lib/geo";
import {
  addFavorite,
  addRecent,
  EMPTY_PLACES,
  MAX_FAVORITES,
  removeFavorite,
  renameFavorite,
  introSeen,
  loadSavedPlaces,
  markIntroSeen,
  removeRecent,
  clearRecents,
  setSlot,
  type SavedPlace,
  type SavedPlaces,
} from "./src/lib/savedPlaces";
import { useTheme } from "./src/theme";

/**
 * Navigation camera: tilted like a driver's view, facing your direction of travel, with
 * the center a little ahead of you so your dot sits in the lower part of the screen.
 */
const NAV_PITCH = 55;
const NAV_ALTITUDE = 320;
const NAV_LOOK_AHEAD_M = 90;
function driveCamera(lat: number, lon: number, heading: number) {
  const h = (heading * Math.PI) / 180;
  const dLat = (Math.cos(h) * NAV_LOOK_AHEAD_M) / 110540;
  const dLon = (Math.sin(h) * NAV_LOOK_AHEAD_M) / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    center: { latitude: lat + dLat, longitude: lon + dLon },
    heading,
    pitch: NAV_PITCH,
    altitude: NAV_ALTITUDE,
  };
}

// Whole contiguous US until we know where you are.
const US_REGION: Region = { latitude: 39.5, longitude: -98.35, latitudeDelta: 30, longitudeDelta: 40 };
const EMPTY: CameraLayer = { mode: "clusters", points: [], clusters: [] };

export default function App() {
  const [fontsLoaded] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });
  const theme = useTheme();
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: theme.mapFallback }} />;
  return (
    <SafeAreaProvider>
      <MapScreen />
    </SafeAreaProvider>
  );
}

function MapScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);

  const [region, setRegion] = useState<Region>(US_REGION);
  const [layer, setLayer] = useState<CameraLayer>(EMPTY);
  const [selected, setSelected] = useState<CameraPoint | null>(null);
  // ---- Free vs Pro ----------------------------------------------------------------
  const pro = usePro();
  const isPro = pro.isPro;
  const proRef = useRef(isPro);
  proRef.current = isPro;
  const [paywall, setPaywall] = useState<{ reason: string | null } | null>(null);
  const openPaywall = useCallback((reason: string | null = null) => setPaywall({ reason }), []);
  // Live road alerts (police / crash / object on road), each lasting an hour.
  const [alerts, setAlerts] = useState<RoadAlert[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<RoadAlert | null>(null);
  // Crashes and objects are free for everyone; seeing police is part of Pro.
  const visibleAlerts = useMemo(() => (isPro ? alerts : alerts.filter((a) => a.type !== "police")), [alerts, isPro]);
  const hiddenPolice = isPro ? 0 : alerts.length - visibleAlerts.length;
  const [searchPin, setSearchPin] = useState<Place | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Route preview state
  const [routes, setRoutes] = useState<RouteOption[] | null>(null);
  const [routeCounts, setRouteCounts] = useState<number[] | null>(null);
  const [speedCounts, setSpeedCounts] = useState<number[] | null>(null);
  const [redCounts, setRedCounts] = useState<number[] | null>(null);
  const [countError, setCountError] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [avoidHighways, setAvoidHighways] = useState(false);
  // Pro: plan for leaving later, and stops on the way (max 3).
  const [departAt, setDepartAt] = useState<number | null>(null);
  const [stops, setStops] = useState<SavedPlace[]>([]);
  const MAX_STOPS = 3;
  const routeOptsRef = useRef({ tolls: false, highways: false, departAt: null as number | null, stops: [] as SavedPlace[] });
  routeOptsRef.current = { tolls: avoidTolls, highways: avoidHighways, departAt, stops };
  const addStopRef = useRef<(p: Place) => void>(() => {});
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [searchingFewer, setSearchingFewer] = useState(false);
  const routeAbortRef = useRef<AbortController | null>(null);

  // Report flow + toasts
  const [reporting, setReporting] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const zoom = useMemo(() => zoomForRegion(region, width), [region, width]);

  // ---- Open to your location -------------------------------------------------
  const flyToUser = useCallback(async (animate = true) => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setLocationDenied(true);
      return;
    }
    setLocationDenied(false);
    const last = await Location.getLastKnownPositionAsync();
    const go = (lat: number, lon: number) => {
      setUserLoc({ lat, lon });
      mapRef.current?.animateToRegion(
        { latitude: lat, longitude: lon, latitudeDelta: 0.03, longitudeDelta: 0.03 },
        animate ? 600 : 1
      );
    };
    if (last) go(last.coords.latitude, last.coords.longitude);
    const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    if (!last) go(fresh.coords.latitude, fresh.coords.longitude);
    else setUserLoc({ lat: fresh.coords.latitude, lon: fresh.coords.longitude });
  }, []);

  // Open straight at your location (no nationwide zoom-out first). The map waits for
  // a position for up to ~4 s; without one (or without permission) it shows the US.
  const [startRegion, setStartRegion] = useState<Region | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const bootedRef = useRef(false);
  const boot = useCallback(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    let done = false;
    const start = (r: Region) => {
      if (done) return;
      done = true;
      setStartRegion(r);
    };
    const near = (lat: number, lon: number): Region => ({
      latitude: lat,
      longitude: lon,
      latitudeDelta: 0.03,
      longitudeDelta: 0.03,
    });
    const timer = setTimeout(() => start(US_REGION), 4000);
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationDenied(true);
        return start(US_REGION);
      }
      const last = await Location.getLastKnownPositionAsync();
      if (last) {
        setUserLoc({ lat: last.coords.latitude, lon: last.coords.longitude });
        start(near(last.coords.latitude, last.coords.longitude));
      }
      const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLoc({ lat: fresh.coords.latitude, lon: fresh.coords.longitude });
      if (done && !last) {
        // Timed out before we had a fix: move there now.
        mapRef.current?.animateToRegion(near(fresh.coords.latitude, fresh.coords.longitude), 600);
      }
      start(near(fresh.coords.latitude, fresh.coords.longitude));
    })()
      .catch(() => start(US_REGION))
      .finally(() => clearTimeout(timer));
  }, []);

  // First launch shows a short explainer before iOS asks for location.
  useEffect(() => {
    introSeen().then((seen) => (seen ? boot() : setShowIntro(true)));
  }, [boot]);

  // ---- Speed (GPS) — also keeps "your location" fresh for directions -----------
  const lastLocRef = useRef<{ lat: number; lon: number } | null>(null);
  const driveFixRef = useRef<((f: { lat: number; lon: number; heading: number | null; mph: number | null }) => void) | null>(null);
  const navFixRef = useRef<((f: { lat: number; lon: number; heading: number | null; mph: number | null }) => void) | null>(null);
  const mph = useSpeed(startRegion != null && !locationDenied, (fix) => {
    navFixRef.current?.(fix);
    driveFixRef.current?.(fix);
    const { lat, lon } = fix;
    const prev = lastLocRef.current;
    // Update the stored location after ~150 m of movement (avoids re-rendering every second).
    if (!prev || Math.abs(prev.lat - lat) > 0.0014 || Math.abs(prev.lon - lon) > 0.0017) {
      lastLocRef.current = { lat, lon };
      setUserLoc({ lat, lon });
    }
  });

  // Home / Work / recents (stored on this phone only).
  const [places, setPlaces] = useState<SavedPlaces>(EMPTY_PLACES);
  // Picking a place from search for: Home, Work, a Pro saved place, or a stop on the route.
  const [settingSlot, setSettingSlot] = useState<"home" | "work" | "fav" | "stop" | null>(null);
  const [searchFocus, setSearchFocus] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const [sheetH, setSheetH] = useState(0);
  const [etas, setEtas] = useState<{ home?: number; work?: number }>({});
  useEffect(() => {
    loadSavedPlaces().then(setPlaces);
  }, []);

  // Admin review (only shown on phones that redeemed an admin code).
  const [admin, setAdmin] = useState<{ isAdmin: boolean; pending: number }>({ isAdmin: false, pending: 0 });
  const [reviewOpen, setReviewOpen] = useState(false);
  const refreshAdmin = useCallback(() => {
    adminStatus().then((s) => {
      setAdmin({ isAdmin: s.is_admin, pending: s.pending ?? 0 });
      setAdminPro(s.is_admin);
    });
  }, []);
  useEffect(() => {
    refreshAdmin();
    refreshGift();
    const sub = AppState.addEventListener("change", (st) => {
      if (st !== "active") return;
      refreshAdmin();
      refreshGift();
    });
    return () => sub.remove();
  }, [refreshAdmin]);

  // ---- Pro: camera density map ------------------------------------------------------
  const [densityOn, setDensityOn] = useState(false);
  const [densityCells, setDensityCells] = useState<DensityCell[]>([]);
  const [densityLoading, setDensityLoading] = useState(false);
  const densityRef = useRef(false);
  densityRef.current = densityOn && isPro;
  const densityAbort = useRef<AbortController | null>(null);
  const loadDensity = useCallback((r: Region) => {
    densityAbort.current?.abort();
    if (!densityRef.current) return;
    const ctrl = new AbortController();
    densityAbort.current = ctrl;
    setDensityLoading(true);
    fetchDensity(boundsForRegion(r), ctrl.signal)
      .then((cells) => !ctrl.signal.aborted && setDensityCells(cells))
      .catch(() => {})
      .finally(() => !ctrl.signal.aborted && setDensityLoading(false));
  }, []);

  // ---- Load cameras for the visible area -------------------------------------
  const load = useCallback(
    (r: Region) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      loadDensity(r);
      fetchCameraLayer(boundsForRegion(r), zoomForRegion(r, width), ctrl.signal)
        .then((l) => {
          setLayer(l);
          setLoadError(null);
        })
        .catch((e) => {
          if (e?.name !== "AbortError") setLoadError("Couldn't load cameras. Check your connection.");
        });
      // Alerts only when zoomed in to roughly a metro area or closer.
      if (zoomForRegion(r, width) >= 9) {
        fetchRoadAlerts(boundsForRegion(r), ctrl.signal)
          .then(setAlerts)
          .catch(() => {});
      } else setAlerts([]);
    },
    [width, loadDensity]
  );

  // Alerts come and go within the hour: refresh them every minute.
  useEffect(() => {
    const t = setInterval(() => {
      const r = regionRef.current;
      if (startRegion && zoomForRegion(r, width) >= 9) {
        fetchRoadAlerts(boundsForRegion(r)).then(setAlerts).catch(() => {});
      }
    }, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRegion, width]);

  // First load, once the map knows where it starts.
  useEffect(() => {
    if (!startRegion) return;
    setRegion(startRegion);
    load(startRegion);
  }, [startRegion, load]);

  // ---- Nearby categories (gas, food, groceries…) --------------------------------
  const [activeCat, setActiveCat] = useState<CategoryId | null>(null);
  const [catResults, setCatResults] = useState<CategoryPlace[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);
  const catAbort = useRef<AbortController | null>(null);
  const catRef = useRef<{ id: CategoryId | null; region: Region | null; paused: boolean }>({
    id: null,
    region: null,
    paused: false,
  });
  const searchCategory = useCallback((id: CategoryId, r: Region) => {
    catAbort.current?.abort();
    const ctrl = new AbortController();
    catAbort.current = ctrl;
    catRef.current.region = r;
    setCatLoading(true);
    setCatError(null);
    fetchCategory(id, { lat: r.latitude, lon: r.longitude }, boundsForRegion(r, 0), ctrl.signal)
      .then((xs) => !ctrl.signal.aborted && setCatResults(xs))
      .catch((e) => e?.name !== "AbortError" && setCatError("Couldn't search nearby places. Check your connection."))
      .finally(() => !ctrl.signal.aborted && setCatLoading(false));
  }, []);

  const onRegionChangeComplete = useCallback(
    (r: Region) => {
      setRegion(r);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        load(r);
        // Browsing a category: search again once the map has moved or zoomed a fair bit.
        const c = catRef.current;
        if (c.id && !c.paused && c.region) {
          const moved =
            Math.abs(r.latitude - c.region.latitude) > c.region.latitudeDelta * 0.3 ||
            Math.abs(r.longitude - c.region.longitude) > c.region.longitudeDelta * 0.3 ||
            Math.abs(Math.log(r.latitudeDelta / c.region.latitudeDelta)) > 0.4;
          if (moved) searchCategory(c.id, r);
        }
      }, 350);
    },
    [load, searchCategory]
  );

  const zoomIntoCluster = useCallback((c: CameraCluster) => {
    setSelected(null);
    const [minLon, minLat, maxLon, maxLat] = c.bbox;
    const span = Math.max(maxLat - minLat, maxLon - minLon);
    if (span > 0.0005) {
      mapRef.current?.fitToCoordinates(
        [
          { latitude: minLat, longitude: minLon },
          { latitude: maxLat, longitude: maxLon },
        ],
        { edgePadding: { top: 160, bottom: 120, left: 60, right: 60 }, animated: true }
      );
    } else {
      mapRef.current?.animateToRegion(
        { latitude: c.lat, longitude: c.lon, latitudeDelta: 0.004, longitudeDelta: 0.004 },
        500
      );
    }
  }, []);

  const regionRef = useRef<Region>(US_REGION);
  regionRef.current = region;

  const selectPoint = useCallback((p: CameraPoint) => {
    Keyboard.dismiss();
    setSelectedAlert(null);
    setSelected(p);
    // Keep the zoom, but slide the camera into the upper part of the screen,
    // clear of the bottom sheet.
    const r = regionRef.current;
    mapRef.current?.animateToRegion(
      { ...r, latitude: p.lat - r.latitudeDelta * 0.22, longitude: p.lon },
      350
    );
  }, []);

  const goToPlace = useCallback((place: Place) => {
    if (settingSlot === "home" || settingSlot === "work") {
      const slot = settingSlot;
      setPlaces((p) => setSlot(p, slot, place));
      showToast(`${slot === "home" ? "Home" : "Work"} saved: ${place.name}`);
      setSettingSlot(null);
      return;
    }
    if (settingSlot === "fav") {
      setSettingSlot(null);
      Keyboard.dismiss();
      Alert.prompt(
        "Name this place",
        place.name,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Save",
            onPress: (label?: string) => {
              setPlaces((p) => addFavorite(p, place, label || place.name));
              showToast(`Saved "${(label || place.name).trim()}"`);
            },
          },
        ],
        "plain-text",
        ""
      );
      return;
    }
    if (settingSlot === "stop") {
      setSettingSlot(null);
      Keyboard.dismiss();
      addStopRef.current(place);
      return;
    }
    setSelected(null);
    setRoutes(null);
    setRouteError(null);
    setStops([]);
    setDepartAt(null);
    setSearchPin(place);
    if (place.extent) {
      const [minLon, maxLat, maxLon, minLat] = place.extent;
      mapRef.current?.fitToCoordinates(
        [
          { latitude: minLat, longitude: minLon },
          { latitude: maxLat, longitude: maxLon },
        ],
        { edgePadding: { top: 160, bottom: 260, left: 40, right: 40 }, animated: true }
      );
    } else {
      mapRef.current?.animateToRegion(
        { latitude: place.lat - 0.002, longitude: place.lon, latitudeDelta: 0.012, longitudeDelta: 0.012 },
        600
      );
    }
  }, [settingSlot, showToast]);

  // ---- Route preview ----------------------------------------------------------
  const fitRoutes = useCallback((rs: RouteOption[]) => {
    const all = rs.flatMap((r) => r.coords);
    if (!all.length) return;
    mapRef.current?.fitToCoordinates(all, {
      edgePadding: { top: 150, bottom: 460, left: 50, right: 50 },
      animated: true,
    });
  }, []);

  // Pro: "avoid all plate readers" with an extra-time budget.
  const [avoidAll, setAvoidAll] = useState(false);
  const [extraMin, setExtraMin] = useState<number | null>(10);
  const avoidAllRef = useRef({ on: false, extraMin: 10 as number | null });
  avoidAllRef.current = { on: avoidAll, extraMin };

  type RouteOpts = { tolls: boolean; highways: boolean; departAt: number | null; stops: SavedPlace[] };
  const loadRoutes = useCallback(
    async (place: Place, override: Partial<RouteOpts> = {}) => {
      const o = { ...routeOptsRef.current, ...override };
      const tolls = o.tolls;
      // Stops and "leave later" are Pro.
      const stopLL = (proRef.current ? o.stops : []).map((x) => ({ latitude: x.lat, longitude: x.lon }));
      let leaveAt = proRef.current ? o.departAt : null;
      if (leaveAt != null && leaveAt < Date.now() + 60_000) {
        // That time has come: plan for leaving now.
        leaveAt = null;
        setDepartAt(null);
      }
      routeAbortRef.current?.abort();
      const ctrl = new AbortController();
      routeAbortRef.current = ctrl;
      setPlaces((p) => addRecent(p, place));
      setRouteLoading(true);
      setRouteError(null);
      setRouteCounts(null);
      setSpeedCounts(null);
      setRedCounts(null);
      setCountError(null);
      try {
        let from = userLoc;
        if (!from) {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== "granted") throw new Error("Turn on location for Expo Go to get directions from where you are.");
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          from = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          setUserLoc(from);
        }
        const rs = await fetchRoutes(
          { latitude: from.lat, longitude: from.lon },
          { latitude: place.lat, longitude: place.lon },
          { avoidTolls: tolls, avoidHighways: o.highways, stops: stopLL, departAt: leaveAt, signal: ctrl.signal }
        );
        if (ctrl.signal.aborted) return;
        setRoutes(rs);
        setSelectedRoute(0);
        setSelected(null);
        fitRoutes(rs);
        setRouteLoading(false);
        // Count cameras along each route on the device (routes never go to our server).
        // If every route passes a camera, look for a detour that passes fewer.
        const fromLL = { latitude: from.lat, longitude: from.lon };
        const toLL = { latitude: place.lat, longitude: place.lon };
        camerasAlongRoutesDetailed(rs, ctrl.signal)
          .then(async (all) => {
            if (ctrl.signal.aborted) return;
            // Ratings and detours are about license plate readers; speed cameras are listed separately.
            const cams = all.map((x) => x.filter((c) => !c.speed));
            const speeds = all.map((x) => x.filter((c) => c.kind === "speed").length);
            const reds = all.map((x) => x.filter((c) => c.kind === "red_light").length);
            const counts = cams.map((x) => x.length);
            // Show the safest route first, then mixed, then unsafe (ties: quicker first).
            const show = (rsX: RouteOption[], cX: number[], sX: number[], rX: number[]) => {
              const order = rsX
                .map((_, i) => i)
                .sort((a, b) => cX[a] - cX[b] || rsX[a].durationSec - rsX[b].durationSec);
              setRoutes(order.map((i) => rsX[i]));
              setRouteCounts(order.map((i) => cX[i]));
              setSpeedCounts(order.map((i) => sX[i]));
              setRedCounts(order.map((i) => rX[i]));
              setSelectedRoute(0);
            };
            show(rs, counts, speeds, reds);
            if (Math.min(...counts) === 0) return;
            setSearchingFewer(true);
            const strict = avoidAllRef.current.on;
            const fewer = await findFewerCamerasRoute(fromLL, toLL, rs, cams, {
              avoidTolls: tolls,
              avoidHighways: o.highways,
              stops: stopLL,
              departAt: leaveAt,
              signal: ctrl.signal,
              ...(strict
                ? {
                    maxExtraSec: avoidAllRef.current.extraMin == null ? Infinity : avoidAllRef.current.extraMin * 60,
                    tries: 7,
                  }
                : {}),
            }).finally(() => setSearchingFewer(false));
            if (fewer && !ctrl.signal.aborted) {
              show([...rs, fewer.route], [...counts, fewer.cameras], [...speeds, fewer.speedCameras], [...reds, fewer.redLights]);
            }
          })
          .catch((e) => e?.name !== "AbortError" && setCountError("Couldn't count cameras on these routes."));
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setRouteLoading(false);
        setRoutes((r) => (r ? [] : r)); // don't leave old routes that don't match the new options
        setRouteError(e?.message ?? "Couldn't get directions. Check your connection.");
      }
    },
    [userLoc, fitRoutes]
  );

  const exitRoutes = useCallback(() => {
    routeAbortRef.current?.abort();
    setStops([]);
    setDepartAt(null);
    setSettingSlot((s) => (s === "stop" ? null : s));
    setRoutes(null);
    setRouteCounts(null);
    setRouteError(null);
    setRouteLoading(false);
  }, []);

  const inRouteMode = routes !== null;

  // Tap Home, Work or a recent place: straight to route previews.
  const goSaved = useCallback(
    (p: SavedPlace) => {
      const place: Place = { ...p };
      setSelected(null);
      setStops([]);
      setDepartAt(null);
      setSearchPin(place);
      loadRoutes(place, { stops: [], departAt: null });
    },
    [loadRoutes]
  );

  // Pro: stops on the way.
  addStopRef.current = (p: Place) => {
    if (!searchPin) return;
    const same = (a: { lat: number; lon: number }) => Math.abs(a.lat - p.lat) < 0.0003 && Math.abs(a.lon - p.lon) < 0.0003;
    if (same(searchPin) || stops.some(same)) {
      showToast("That place is already on this trip.");
      return;
    }
    const next = [...stops, { id: `${p.id}`, name: p.name, subtitle: p.subtitle, lat: p.lat, lon: p.lon }].slice(0, MAX_STOPS);
    setStops(next);
    loadRoutes(searchPin, { stops: next });
  };
  const removeStop = (id: string) => {
    const i = stops.findIndex((x) => x.id === id);
    const next = stops.filter((_, k) => k !== i);
    setStops(next);
    if (searchPin) loadRoutes(searchPin, { stops: next });
  };

  // Pro: leave later.
  const pickDeparture = () => {
    if (!isPro) return openPaywall("Planning a trip for later is part of DeCam GPS Pro.");
    const now = new Date();
    const at = (d: Date) => d.getTime();
    const inMin = (m: number) => {
      const d = new Date(now.getTime() + m * 60_000);
      d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
      return at(d);
    };
    const clock = (dayOffset: number, h: number) => at(new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, h, 0, 0));
    const opts: { label: string; t: number | null }[] = [
      { label: "Leave now", t: null },
      { label: "In 30 minutes", t: inMin(30) },
      { label: "In 1 hour", t: inMin(60) },
      { label: "In 2 hours", t: inMin(120) },
    ];
    if (now.getHours() < 16) opts.push({ label: "Today at 5:00 PM", t: clock(0, 17) });
    opts.push({ label: "Tomorrow at 8:00 AM", t: clock(1, 8) }, { label: "Tomorrow at 5:00 PM", t: clock(1, 17) });
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "When are you leaving?",
        message: "Times use the traffic Mapbox expects then.",
        options: [...opts.map((o) => o.label), "Cancel"],
        cancelButtonIndex: opts.length,
        userInterfaceStyle: theme.isDark ? "dark" : "light",
      },
      (i) => {
        if (i >= opts.length) return;
        const t = opts[i].t;
        setDepartAt(t);
        if (searchPin) loadRoutes(searchPin, { departAt: t });
      }
    );
  };

  // Drive times for the Home / Work tiles (once per place per app launch).
  const hasLoc = userLoc != null;
  useEffect(() => {
    if (!userLoc) return;
    const from = { latitude: userLoc.lat, longitude: userLoc.lon };
    for (const slot of ["home", "work"] as const) {
      const p = places[slot];
      if (!p) {
        setEtas((e) => (e[slot] == null ? e : { ...e, [slot]: undefined }));
        continue;
      }
      fetchRoutes(from, { latitude: p.lat, longitude: p.lon }, { alternatives: false })
        .then((rs) => rs[0] && setEtas((e) => ({ ...e, [slot]: rs[0].durationSec })))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLoc, places.home?.id, places.work?.id]);

  // Free version: plate readers only (speed cameras are part of Pro).
  const shownLayer = useMemo(
    () =>
      isPro
        ? layer
        : { ...layer, points: layer.points.filter((p) => !isEnforcement(p)), clusters: layer.clusters.filter((c) => !isEnforcement(c)) },
    [layer, isPro]
  );
  const nearbyCount = useMemo(
    () => (startRegion ? shownLayer.points.length + shownLayer.clusters.reduce((n, c) => n + c.count, 0) : null),
    [shownLayer, startRegion]
  );

  // ---- Report new equipment ----------------------------------------------------
  // ---- Turn-by-turn navigation -----------------------------------------------------
  const [nav, setNav] = useState<{
    dest: Place;
    fewest: boolean;
    tolls: boolean;
    highways: boolean;
    /** Stops not reached yet, in order. */
    stops: SavedPlace[];
  } | null>(null);
  const [navRoute, setNavRoute] = useState<RouteOption | null>(null);
  const [navUpdate, setNavUpdate] = useState<NavUpdate | null>(null);
  const [rerouting, setRerouting] = useState(false);
  const [follow, setFollow] = useState(true);
  const [muted, setMutedState] = useState(false);
  const [navFooterH, setNavFooterH] = useState(0);
  const engineRef = useRef<NavEngine | null>(null);
  const navStateRef = useRef(nav);
  navStateRef.current = nav;
  const followRef = useRef(follow);
  followRef.current = follow;
  const reroutingRef = useRef(false);
  const lastRerouteRef = useRef(0);
  const headingRef = useRef(0);
  const hazardsRef = useRef<{ cams: Hazard[]; alerts: Hazard[] }>({ cams: [], alerts: [] });
  const navActive = nav != null;

  useEffect(() => {
    loadMuted().then(setMutedState);
  }, []);
  const toggleMuted = useCallback((m: boolean) => {
    setMutedState(m);
    setVoiceMuted(m);
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [badgesOpen, setBadgesOpen] = useState(false);

  const applyHazards = useCallback(() => {
    engineRef.current?.setHazards([...hazardsRef.current.cams, ...hazardsRef.current.alerts]);
  }, []);

  // Cameras on the route get a spoken heads-up ~400 m before you reach them.
  const loadRouteHazards = useCallback(
    (r: RouteOption) => {
      hazardsRef.current.cams = [];
      camerasAlongRoutesDetailed([r])
        .then(([cams]) => {
          hazardsRef.current.cams = cams.filter((c) => !c.speed || proRef.current).map((c) => ({
            key: `cam${c.id}`,
            lat: c.lat,
            lon: c.lon,
            text:
              c.kind === "speed" ? "Speed camera ahead." : c.kind === "red_light" ? "Red-light camera ahead." : "License plate reader ahead.",
          }));
          applyHazards();
        })
        .catch(() => {});
    },
    [applyHazards]
  );

  // Live road alerts along the route (police, crashes, objects).
  useEffect(() => {
    if (!navActive) return;
    const words = { police: "Police reported ahead.", crash: "Crash reported ahead.", hazard: "Object on the road reported ahead." };
    hazardsRef.current.alerts = visibleAlerts.map((a) => ({ key: `ra${a.id}`, lat: a.lat, lon: a.lon, text: words[a.type] }));
    applyHazards();
  }, [visibleAlerts, navActive, navRoute, applyHazards]);

  const reroute = useCallback(
    async (at: { lat: number; lon: number }) => {
      const n = navStateRef.current;
      if (!n) return;
      reroutingRef.current = true;
      lastRerouteRef.current = Date.now();
      setRerouting(true);
      if (proRef.current) say("Rerouting.");
      try {
        const from = { latitude: at.lat, longitude: at.lon };
        const to = { latitude: n.dest.lat, longitude: n.dest.lon };
        const stopLL = n.stops.map((x) => ({ latitude: x.lat, longitude: x.lon }));
        const rs = await fetchRoutes(from, to, { avoidTolls: n.tolls, avoidHighways: n.highways, stops: stopLL });
        // Keep avoiding plate readers: take the new option that passes the fewest.
        const all = await camerasAlongRoutesDetailed(rs).catch(() => rs.map(() => []));
        const cams = all.map((x) => x.filter((c) => !c.speed));
        let j = 0;
        cams.forEach((c, i) => c.length < cams[j].length && (j = i));
        let best = rs[j];
        if (n.fewest && cams[j].length > 0) {
          const f = await findFewerCamerasRoute(from, to, rs, cams, {
            avoidTolls: n.tolls,
            avoidHighways: n.highways,
            stops: stopLL,
          }).catch(() => null);
          if (f && f.cameras < cams[j].length) best = f.route;
        }
        if (!navStateRef.current) return;
        engineRef.current = new NavEngine(best);
        setNavRoute(best);
        loadRouteHazards(best);
      } catch {
        showToast("Couldn't find a new route. Keep going and we'll try again.");
      } finally {
        reroutingRef.current = false;
        setRerouting(false);
      }
    },
    [loadRouteHazards, showToast]
  );

  // Every GPS fix while navigating: progress, voice, camera follow, off-route check.
  navFixRef.current = (fix) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (fix.heading != null && (fix.mph ?? 0) > 3) headingRef.current = fix.heading;
    const u = engine.update(fix);
    setNavUpdate(u);
    if (proRef.current) u.speak.forEach(say);
    // Reached a stop? Later reroutes skip it.
    const n = navStateRef.current;
    if (n && n.stops.length && metersBetween(fix, n.stops[0]) < 90) {
      const next = { ...n, stops: n.stops.slice(1) };
      navStateRef.current = next;
      setNav(next);
    }
    // Pro: a spoken reminder after ~4 s at 5+ mph over the limit (at most every 2 minutes).
    const sp = speedingRef.current;
    if (u.speedLimit != null && fix.mph != null && fix.mph >= u.speedLimit + SPEEDING_MARGIN) {
      sp.count++;
      if (sp.count >= 4 && Date.now() - sp.lastSaid > 120_000 && speedWarnRef.current) {
        sp.lastSaid = Date.now();
        say(`Speed limit ${u.speedLimit}.`);
      }
    } else sp.count = 0;
    if (followRef.current && !reporting) {
      mapRef.current?.animateCamera(driveCamera(fix.lat, fix.lon, headingRef.current), { duration: 900 });
    }
    if (u.offRoute && !u.arrived && !reroutingRef.current && Date.now() - lastRerouteRef.current > 15_000) {
      reroute(fix);
    }
  };

  const speedingRef = useRef({ count: 0, lastSaid: 0 });
  const speedWarnRef = useRef(false);

  const startNav = useCallback(() => {
    const r = routes?.[selectedRoute];
    if (!r || !searchPin) return;
    // Privacy report (on this phone): plate readers on this route vs the fastest one.
    if (routes && routeCounts && routeCounts.length === routes.length) {
      let f = 0;
      routes.forEach((x, i) => x.durationSec < routes[f].durationSec && (f = i));
      recordTrip(routeCounts[selectedRoute], routeCounts[f] - routeCounts[selectedRoute]);
    }
    engineRef.current = new NavEngine(r);
    setNavRoute(r);
    setNav({
      dest: searchPin,
      fewest: r.id === "fewest",
      tolls: avoidTolls,
      highways: avoidHighways,
      // Compare against where Mapbox put each stop on the road (a mall's pin can be far from the street).
      stops: proRef.current
        ? stops.map((x, k) => (r.stopPoints[k] ? { ...x, lat: r.stopPoints[k].latitude, lon: r.stopPoints[k].longitude } : x))
        : [],
    });
    speedingRef.current = { count: 0, lastSaid: 0 };
    setNavUpdate(null);
    setFollow(true);
    setSelected(null);
    setSelectedAlert(null);
    hazardsRef.current.alerts = [];
    loadRouteHazards(r);
    activateKeepAwakeAsync("nav").catch(() => {});
    if (userLoc) {
      mapRef.current?.animateCamera(driveCamera(userLoc.lat, userLoc.lon, headingRef.current), { duration: 700 });
    }
  }, [routes, routeCounts, selectedRoute, searchPin, avoidTolls, avoidHighways, stops, loadRouteHazards, userLoc]);

  const endNav = useCallback(() => {
    engineRef.current = null;
    setNav(null);
    setNavRoute(null);
    setNavUpdate(null);
    stopSpeaking();
    deactivateKeepAwake("nav");
    exitRoutes();
    setSearchPin(null);
    if (userLoc) {
      mapRef.current?.animateCamera(
        { center: { latitude: userLoc.lat, longitude: userLoc.lon }, heading: 0, altitude: 3500, pitch: 0 },
        { duration: 700 }
      );
    }
  }, [exitRoutes, userLoc]);

  // ---- Pro: drive mode alerts (no route needed) -----------------------------------------
  const prefs = usePrefs();
  const nearbyCamsRef = useRef<{ at: { lat: number; lon: number } | null; cams: Cam[]; busy: boolean }>({
    at: null,
    cams: [],
    busy: false,
  });
  const watcherRef = useRef(new DriveWatcher());
  const passRef = useRef(new PassTracker());
  const driveCtx = useRef({ on: false, alerts: [] as RoadAlert[], voice: false, ask: false, pro: false });
  driveCtx.current = {
    on: isPro && prefs.driveAlerts && !navActive,
    alerts: visibleAlerts,
    voice: isPro && !muted,
    ask: prefs.askStillHere && !reporting,
    pro: isPro,
  };
  speedWarnRef.current = isPro && prefs.speedWarn && !muted;

  // "Still here?" after you drive past a camera (free). At most one question every 4 minutes.
  const [stillHere, setStillHere] = useState<{ id: number; label: string; at: { lat: number; lon: number } } | null>(null);
  const lastAskRef = useRef(0);
  const answerStillHere = useCallback(
    (yes: boolean) => {
      const q = stillHere;
      setStillHere(null);
      if (!q) return;
      voteOnPoint(q.id, yes ? "confirm" : "gone", q.at)
        .then(() => showToast(yes ? "Thanks! Marked as still there." : "Thanks! We'll check on that camera."))
        .catch((e) => showToast(e?.message ?? "Couldn't send that. Try again."));
    },
    [stillHere, showToast]
  );
  const dismissStillHere = useCallback(() => setStillHere(null), []);

  driveFixRef.current = (fix) => {
    const ctx = driveCtx.current;
    if (!ctx.on && !ctx.ask) return;
    const near = nearbyCamsRef.current;
    if ((fix.mph ?? 0) < 5 && !near.at) return; // not driving yet
    if (!near.busy && (!near.at || metersBetween(near.at, fix) > 1500)) {
      near.busy = true;
      fetchNearbyCams(fix.lat, fix.lon)
        .then((cams) => {
          near.cams = cams;
          near.at = { lat: fix.lat, lon: fix.lon };
        })
        .catch(() => {})
        .finally(() => (near.busy = false));
    }
    // Passed a camera? Maybe ask if it's still there.
    if (ctx.ask) {
      const visible = near.cams.filter((c) => ctx.pro || !c.speed);
      const passed = passRef.current.update(
        fix,
        visible.map((c) => ({ key: String(c.id), lat: c.lat, lon: c.lon }))
      );
      if (passed.length && Date.now() - lastAskRef.current > 4 * 60_000) {
        const cam = visible.find((c) => String(c.id) === passed[0]);
        if (cam) {
          lastAskRef.current = Date.now();
          setStillHere({
            id: cam.id,
            label: cam.kind === "speed" ? "speed camera" : cam.kind === "red_light" ? "red-light camera" : "plate reader",
            at: { lat: fix.lat, lon: fix.lon }, // where you were just now (~70 m past it)
          });
        }
      }
    }
    if (!ctx.on) return;
    const items: AheadItem[] = [
      ...near.cams.map((c) => ({ key: `c${c.id}`, lat: c.lat, lon: c.lon, dir: c.dir, kind: c.kind, label: CAM_LABEL[c.kind] })),
      ...ctx.alerts.map((a) => ({ key: `a${a.id}`, lat: a.lat, lon: a.lon, dir: null, kind: a.type, label: CAM_LABEL[a.type] })),
    ];
    const passed = watcherRef.current.passedNow(fix, items);
    if (passed.length) recordPassed(passed.length);
    if ((fix.mph ?? 0) < 10 || fix.heading == null) return;
    const hits = watcherRef.current.check({ lat: fix.lat, lon: fix.lon, heading: fix.heading }, items);
    if (hits.length) {
      const h = hits[0];
      showToast(`${h.label} · ${feetText(h.meters)}`);
      if (ctx.voice) say(`${h.label}.`);
    }
  };

  // ---- Pro: commute watch (Home → Work), checked about twice a day ----------------------
  const [commute, setCommute] = useState<CommuteStatus | null>(null);
  const commuteKey = places.home && places.work ? `${places.home.id}>${places.work.id}` : null;
  useEffect(() => {
    if (!isPro || !places.home || !places.work) return;
    let live = true;
    checkCommute(places.home, places.work)
      .then((c) => live && setCommute(c))
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro, commuteKey]);
  const [reportOpen, setReportOpen] = useState(false);

  // Report button: live alerts go in with one tap at your spot; cameras use the pin flow.
  const sendAlert = useCallback(
    async (type: RoadAlertType) => {
      showToast(`Reporting ${ALERT_LABEL[type].toLowerCase()}…`);
      try {
        const a = await reportRoadAlert(type);
        showToast(
          a.merged
            ? `Thanks! ${ALERT_LABEL[type]} was already reported here, so we kept it up for another hour.`
            : type === "police" && !proRef.current
              ? "Thanks! Police reported for the next hour. Seeing police alerts is part of Pro."
              : `Thanks! ${ALERT_LABEL[type]} will show here for the next hour.`
        );
        setAlerts((xs) => [a, ...xs.filter((x) => x.id !== a.id)]);
      } catch (e: any) {
        showToast(e?.message ?? "Couldn't send that. Try again.");
      }
    },
    [showToast]
  );

  const startReport = useCallback(
    (at?: { latitude: number; longitude: number }) => {
      Keyboard.dismiss();
      setSelected(null);
      setReportError(null);
      setReporting(true);
      const target = at ?? (userLoc ? { latitude: userLoc.lat, longitude: userLoc.lon } : null);
      if (target) {
        mapRef.current?.animateToRegion({ ...target, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 400);
      }
    },
    [userLoc]
  );

  const submitReport = useCallback(
    async (directionDeg: number | null, category: "alpr" | "speed_camera" | "red_light") => {
      setReportBusy(true);
      setReportError(null);
      try {
        const cam = await mapRef.current?.getCamera();
        if (!cam) throw new Error("Map isn't ready yet. Try again.");
        const r = await reportNewPoint(cam.center.latitude, cam.center.longitude, directionDeg, category);
        setReporting(false);
        if (r.merged_into) {
          showToast(r.note ? `That camera is already on the map. ${r.note}` : "That camera is already on the map, so we counted it as a confirmation. Thanks!");
        } else {
          showToast("Thanks! Others nearby will confirm it.");
        }
        load(regionRef.current);
      } catch (e: any) {
        setReportError(e?.message ?? "Couldn't send the report. Try again.");
      } finally {
        setReportBusy(false);
      }
    },
    [load, showToast]
  );
  const showCones = zoom >= 13;
  const showHome =
    startRegion != null &&
    !activeCat &&
    !reporting &&
    !inRouteMode &&
    !selected &&
    !selectedAlert &&
    !searchPin &&
    !searchFocused &&
    !settingSlot;
  const showCat =
    activeCat != null && startRegion != null && !reporting && !inRouteMode && !selected && !selectedAlert && !searchPin;
  const chipsVisible =
    startRegion != null && !reporting && !inRouteMode && !searchFocused && !settingSlot && !selected && !selectedAlert;
  const homeH = (showHome || showCat) && sheetH ? sheetH : 0;
  const controlsTop = insets.top + (inRouteMode ? 112 : chipsVisible ? 118 : 74);
  // Don't re-search while a place from the list is open.
  catRef.current.id = activeCat;
  catRef.current.paused = searchPin != null || inRouteMode;

  const pickCategory = (id: CategoryId | null) => {
    Keyboard.dismiss();
    setActiveCat(id);
    setCatResults([]);
    setCatError(null);
    catAbort.current?.abort();
    setCatLoading(false);
    if (!id) return;
    setSearchPin(null);
    let r = regionRef.current;
    // Zoomed way out? Search around you instead of the whole map.
    if (r.latitudeDelta > 0.5) {
      const c = userLoc ?? { lat: r.latitude, lon: r.longitude };
      r = { latitude: c.lat, longitude: c.lon, latitudeDelta: 0.08, longitudeDelta: 0.08 };
      mapRef.current?.animateToRegion(r, 500);
    }
    searchCategory(id, r);
  };
  const shadow = {
    shadowColor: theme.shadowColor,
    shadowOpacity: theme.isDark ? 0.4 : 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  };

  if (showIntro) {
    const finish = (ask: boolean) => {
      markIntroSeen();
      setShowIntro(false);
      if (ask) boot();
      else {
        bootedRef.current = true;
        setStartRegion(US_REGION);
      }
    };
    return (
      <>
        <StatusBar style={theme.isDark ? "light" : "dark"} />
        <LocationIntro theme={theme} onContinue={() => finish(true)} onSkip={() => finish(false)} />
      </>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.mapFallback }]}>
      <StatusBar style={theme.isDark ? "light" : "dark"} />
      {startRegion ? (
      <MapView
        ref={mapRef}
        style={styles.fill}
        initialRegion={startRegion}
        onRegionChangeComplete={onRegionChangeComplete}
        onPanDrag={() => {
          if (navActive && followRef.current) setFollow(false);
        }}
        onPress={() => {
          Keyboard.dismiss();
          if (!reporting) {
            setSelected(null);
            setSelectedAlert(null);
          }
        }}
        onLongPress={(e) => {
          if (!inRouteMode && !reporting) startReport(e.nativeEvent.coordinate);
        }}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterests={false}
        showsBuildings={navActive}
        // Tilted, driver's-eye view while navigating (iOS ignores camera tilt when this is off).
        pitchEnabled={navActive}
        mapType={isPro ? prefs.mapStyle : "mutedStandard"}
        userInterfaceStyle={theme.isDark ? "dark" : "light"}
        tintColor={theme.accent}
        legalLabelInsets={{ top: 0, right: 0, left: 12, bottom: homeH || (selected || searchPin ? 0 : insets.bottom) }}
      >
        {showCones ? (
          <DirectionCones points={shownLayer.points} selectedId={selected?.id ?? null} zoom={zoom} theme={theme} />
        ) : null}
        {densityOn && isPro && !navActive && !inRouteMode ? (
          <DensityLayer cells={densityCells} isDark={theme.isDark} />
        ) : null}
        {shownLayer.clusters.map((c) => (
          <ClusterMarker key={`${c.id}-${c.count}`} cluster={c} theme={theme} onPress={zoomIntoCluster} />
        ))}
        {activeCat && !inRouteMode
          ? catResults.map((p) => <CategoryPin key={`cp-${p.id}`} place={p} theme={theme} onPress={(x) => goToPlace(x)} />)
          : null}
        {visibleAlerts.map((a) => (
          <RoadAlertMarker
            key={`ra-${a.id}`}
            alert={a}
            selected={a.id === selectedAlert?.id}
            theme={theme}
            onPress={(x) => {
              Keyboard.dismiss();
              setSelected(null);
              setSelectedAlert(x);
            }}
          />
        ))}
        {shownLayer.points.map((p) => (
          <CameraMarker
            key={p.id}
            point={p}
            selected={p.id === selected?.id}
            theme={theme}
            onPress={selectPoint}
          />
        ))}
        {navActive && navRoute
          ? [
              <Polyline
                key={`nav-casing-${navRoute.id}-${navRoute.distanceM}`}
                coordinates={navRoute.coords}
                strokeColor={theme.routeCasing}
                strokeWidth={12}
                lineCap="round"
                lineJoin="round"
                zIndex={20}
              />,
              <Polyline
                key={`nav-line-${navRoute.id}-${navRoute.distanceM}`}
                coordinates={navRoute.coords}
                strokeColor={theme.route}
                strokeWidth={8}
                lineCap="round"
                lineJoin="round"
                zIndex={21}
              />,
            ]
          : routes
          ? // Unselected routes first (grey), the selected one on top (accent), each with a casing.
            routes
              .map((r, i) => ({ r, i }))
              .sort((a, b) => (a.i === selectedRoute ? 1 : 0) - (b.i === selectedRoute ? 1 : 0))
              .flatMap(({ r, i }) => {
                const sel = i === selectedRoute;
                return [
                  <Polyline
                    key={`${r.id}-casing-${sel}`}
                    coordinates={r.coords}
                    strokeColor={theme.routeCasing}
                    strokeWidth={sel ? 10 : 8}
                    lineCap="round"
                    lineJoin="round"
                    zIndex={sel ? 20 : 10}
                  />,
                  <Polyline
                    key={`${r.id}-line-${sel}`}
                    coordinates={r.coords}
                    strokeColor={sel ? theme.route : theme.routeAlt}
                    strokeWidth={sel ? 6 : 5}
                    lineCap="round"
                    lineJoin="round"
                    zIndex={sel ? 21 : 11}
                    tappable
                    onPress={() => setSelectedRoute(i)}
                  />,
                ];
              })
          : null}
        {searchPin ? (
          <Marker
            key={`dest-${theme.isDark ? "d" : "l"}`}
            coordinate={{ latitude: searchPin.lat, longitude: searchPin.lon }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            zIndex={900}
            accessibilityLabel={searchPin.name}
          >
            <View style={{ alignItems: "center" }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: theme.destination,
                  borderWidth: 2,
                  borderColor: theme.destinationInner,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.destinationInner }} />
              </View>
              <View
                style={{
                  width: 0,
                  height: 0,
                  borderLeftWidth: 6,
                  borderRightWidth: 6,
                  borderTopWidth: 9,
                  borderLeftColor: "transparent",
                  borderRightColor: "transparent",
                  borderTopColor: theme.destination,
                  marginTop: -2,
                }}
              />
            </View>
          </Marker>
        ) : null}
        {(navActive ? nav?.stops ?? [] : inRouteMode ? stops : []).map((st, i) => (
          <Marker
            key={`stop-${st.id}-${i}-${theme.isDark ? "d" : "l"}`}
            coordinate={{ latitude: st.lat, longitude: st.lon }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            zIndex={890}
            accessibilityLabel={`Stop ${i + 1}: ${st.name}`}
          >
            <View style={[styles.stopPin, { backgroundColor: theme.accent, borderColor: theme.destinationInner }]}>
              <Txt weight="bold" style={{ fontSize: 12, color: theme.onAccent }}>
                {i + 1}
              </Txt>
            </View>
          </Marker>
        ))}
      </MapView>
      ) : null}

      {!reporting ? (
        navActive ? (
          <Speedometer theme={theme} mph={mph} bottom={navFooterH + 16} limit={navUpdate?.speedLimit ?? null} />
        ) : (
          <Speedometer theme={theme} mph={mph} top={controlsTop} />
        )
      ) : null}

      {/* Recenter */}
      <View
        pointerEvents={navActive ? "none" : "auto"}
        style={[styles.controls, { top: controlsTop, backgroundColor: theme.control, opacity: navActive ? 0 : 1 }, shadow]}
      >
        <Pressable
          onPress={() => flyToUser(true)}
          accessibilityRole="button"
          accessibilityLabel="Show my location"
          style={({ pressed }) => [styles.controlButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <LocateIcon color={theme.accentIcon} />
        </Pressable>
        <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: theme.divider, marginHorizontal: 10 }} />
        <Pressable
          onPress={() => {
            if (!isPro) return openPaywall("Voice guidance is part of DeCam GPS Pro.");
            toggleMuted(!muted);
            showToast(muted ? "Voice guidance on" : "Voice guidance off");
          }}
          accessibilityRole="button"
          accessibilityLabel={!isPro ? "Voice guidance (Pro)" : muted ? "Turn voice guidance on" : "Turn voice guidance off"}
          style={({ pressed }) => [styles.controlButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <SpeakerIcon muted={muted || !isPro} color={muted || !isPro ? theme.textSecondary : theme.accentIcon} />
        </Pressable>
        <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: theme.divider, marginHorizontal: 10 }} />
        <Pressable
          onPress={() => {
            if (!isPro) return openPaywall("The camera density map is part of DeCam GPS Pro.");
            const next = !densityOn;
            setDensityOn(next);
            densityRef.current = next;
            if (next) {
              loadDensity(regionRef.current);
              showToast("Density map on: darker red means more plate readers.");
            } else setDensityCells([]);
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: densityOn && isPro }}
          accessibilityLabel={isPro ? "Camera density map" : "Camera density map (Pro)"}
          style={({ pressed }) => [
            styles.controlButton,
            densityOn && isPro && { backgroundColor: theme.badgeBg, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <DensityIcon color={densityOn && isPro ? theme.badgeText : isPro ? theme.accentIcon : theme.textSecondary} />
        </Pressable>
      </View>

      {navActive ? <NavBanner theme={theme} update={navUpdate} rerouting={rerouting} showLanes={isPro} /> : null}
      {navActive && stillHere ? (
        <StillHerePrompt
          theme={theme}
          label={stillHere.label}
          bottom={navFooterH + 108}
          onAnswer={answerStillHere}
          onDismiss={dismissStillHere}
        />
      ) : null}
      {navActive && toast ? (
        <View style={[styles.top, { top: insets.top + 150 }]} pointerEvents="none">
          <View style={[styles.toast, { backgroundColor: theme.control }, shadow]}>
            <Txt weight="medium" style={{ color: theme.text, fontSize: 14 }}>
              {toast}
            </Txt>
          </View>
        </View>
      ) : null}
      {navActive && !follow ? (
        <RecenterPill theme={theme} bottom={navFooterH + 16} onPress={() => setFollow(true)} />
      ) : null}

      {/* Search, or the from/to card while previewing routes */}
      <View
        style={[styles.top, { top: insets.top + 8, display: navActive ? "none" : "flex" }]}
        pointerEvents="box-none"
      >
        {reporting ? (
          <View style={[styles.toast, { backgroundColor: theme.control }, shadow]}>
            <Txt weight="semibold" style={{ color: theme.text, fontSize: 15 }}>
              Move the map so the pin sits on the camera
            </Txt>
          </View>
        ) : inRouteMode && searchPin && settingSlot !== "stop" ? (
          <RouteHeader
            theme={theme}
            destination={stops.length ? `${searchPin.name} (${stops.length} ${stops.length === 1 ? "stop" : "stops"})` : searchPin.name}
            onBack={exitRoutes}
          />
        ) : (
          <SearchBar
            theme={theme}
            near={userLoc ?? { lat: region.latitude, lon: region.longitude }}
            onSelect={goToPlace}
            onClear={() => {
              if (settingSlot === "stop") return; // keep the trip you're adding a stop to
              setSearchPin(null);
              setRouteError(null);
            }}
            placeholder={
              settingSlot === "home" || settingSlot === "work"
                ? `Search for your ${settingSlot} address`
                : settingSlot === "fav"
                  ? "Search for a place to save"
                  : settingSlot === "stop"
                    ? "Search for a stop on the way"
                    : undefined
            }
            focusSignal={searchFocus}
            clearOnPick={settingSlot != null}
            onFocusChange={setSearchFocused}
            rightAccessory={
              settingSlot ? null : (
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    setSettingsOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Settings"
                  hitSlop={6}
                  style={({ pressed }) => [styles.gear, { backgroundColor: theme.subtle, opacity: pressed ? 0.7 : 1 }]}
                >
                  <GearIcon color={theme.text} />
                </Pressable>
              )
            }
            onAdminCode={(code) => {
              claimAdmin(code)
                .then(() => {
                  showToast("You're an admin on this phone. Use the Review button to check reports.");
                  refreshAdmin();
                })
                .catch((e) => showToast(e?.message ?? "Couldn't use that code."));
            }}
          />
        )}
        {chipsVisible ? <CategoryChips theme={theme} active={activeCat} onPick={pickCategory} /> : null}
        {settingSlot && !reporting && (!inRouteMode || settingSlot === "stop") ? (
          <View style={[styles.toast, styles.settingRow, { backgroundColor: theme.control }, shadow]}>
            <Txt weight="medium" style={{ color: theme.text, fontSize: 14, flex: 1 }}>
              {settingSlot === "stop"
                ? "Pick a result to add it as a stop."
                : settingSlot === "fav"
                  ? "Pick a result, then give it a name."
                  : `Pick a result to save it as ${settingSlot === "home" ? "Home" : "Work"}.`}
            </Txt>
            <Pressable
              onPress={() => {
                setSettingSlot(null);
                Keyboard.dismiss();
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              hitSlop={8}
              style={[styles.settingClose, { backgroundColor: theme.closeBg }]}
            >
              <CloseIcon size={14} color={theme.text} />
            </Pressable>
          </View>
        ) : null}
        {toast ? (
          <View style={[styles.toast, { backgroundColor: theme.control }, shadow]}>
            <Txt weight="medium" style={{ color: theme.text, fontSize: 14 }}>
              {toast}
            </Txt>
          </View>
        ) : null}
        {!navActive && stillHere && !reporting ? (
          <StillHerePrompt theme={theme} label={stillHere.label} onAnswer={answerStillHere} onDismiss={dismissStillHere} />
        ) : null}
        {loadError ? (
          <View style={[styles.toast, { backgroundColor: theme.control }, shadow]}>
            <Txt weight="medium" style={{ color: theme.text, fontSize: 14 }}>
              {loadError}
            </Txt>
          </View>
        ) : null}
        {locationDenied ? (
          <View style={[styles.toast, { backgroundColor: theme.control }, shadow]}>
            <Txt weight="medium" style={{ color: theme.text, fontSize: 14 }}>
              Location is off. Turn it on in Settings › Expo Go to center the map on you.
            </Txt>
          </View>
        ) : null}
      </View>

      {/* ODbL attribution */}
      {!selected && !searchPin && !inRouteMode && !reporting ? (
        <View style={[styles.attribution, { bottom: homeH ? homeH + 4 : insets.bottom + 4 }]} pointerEvents="none">
          <Txt style={{ fontSize: 10, color: theme.textSecondary }}>Camera data © OpenStreetMap contributors</Txt>
        </View>
      ) : null}

      {reporting ? <PlacementPin theme={theme} /> : null}

      {densityOn && isPro && !navActive && !inRouteMode && !reporting && !selected && !searchPin ? (
        <DensityLegend
          theme={theme}
          loading={densityLoading}
          bottom={(homeH ? homeH + 24 : insets.bottom + 28) + (hiddenPolice > 0 ? 56 : 0)}
        />
      ) : null}

      {/* Free version: a small hint when police have been reported in view */}
      {hiddenPolice > 0 && !reporting && !selected && !selectedAlert && (navActive || (!inRouteMode && !searchPin)) ? (
        <Pressable
          onPress={() =>
            openPaywall(
              `${hiddenPolice === 1 ? "1 police report is" : `${hiddenPolice} police reports are`} on the map near you right now.`
            )
          }
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.policeHint,
            {
              // While navigating the speedometer sits bottom-left, so go above it.
              bottom: navActive ? navFooterH + 104 : homeH ? homeH + 24 : insets.bottom + 28,
              backgroundColor: theme.control,
              opacity: pressed ? 0.8 : 1,
            },
            shadow,
          ]}
        >
          <View style={[styles.policeDot, { backgroundColor: theme.policeFill }]}>
            <PoliceIcon size={14} color={theme.alertGlyph} />
          </View>
          <Txt weight="semibold" style={{ fontSize: 14, color: theme.text }}>
            {hiddenPolice} police nearby
          </Txt>
          <View style={[styles.proMini, { backgroundColor: theme.accent }]}>
            <Txt weight="bold" style={{ fontSize: 10, color: theme.onAccent }}>
              PRO
            </Txt>
          </View>
        </Pressable>
      ) : null}

      {/* Report button (Home board: white pill, bottom right) */}
      {navActive || (!reporting && !inRouteMode && !selected && !selectedAlert && !searchPin) ? (
        <Pressable
          onPress={() =>
            ActionSheetIOS.showActionSheetWithOptions(
              {
                title: "What do you see?",
                message: "Police, crashes and objects are reported where you are now and last an hour.",
                options: isPro
                  ? ["Police", "Crash", "Object on road", "Camera (plate reader or speed)", "Cancel"]
                  : ["Police", "Crash", "Object on road", "Plate reader camera", "Cancel"],
                cancelButtonIndex: 4,
                userInterfaceStyle: theme.isDark ? "dark" : "light",
              },
              (i) => {
                if (i === 0) sendAlert("police");
                else if (i === 1) sendAlert("crash");
                else if (i === 2) sendAlert("hazard");
                else if (i === 3) startReport();
              }
            )
          }
          accessibilityRole="button"
          accessibilityLabel="Report equipment"
          accessibilityHint="You can also long-press the map"
          style={({ pressed }) => [
            styles.reportButton,
            {
              bottom: navActive ? navFooterH + 16 : homeH ? homeH + 24 : insets.bottom + 28,
              backgroundColor: theme.control,
              opacity: pressed ? 0.8 : 1,
            },
            shadow,
          ]}
        >
          <PlusIcon color={theme.text} />
          <Txt weight="semibold" style={{ color: theme.text, fontSize: 15 }}>
            Report
          </Txt>
        </Pressable>
      ) : null}

      {admin.isAdmin && !reporting && !inRouteMode && !selected && !selectedAlert && !searchPin ? (
        <Pressable
          onPress={() => setReviewOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Review reports, ${admin.pending} waiting`}
          style={({ pressed }) => [
            styles.reportButton,
            { bottom: (homeH ? homeH + 24 : insets.bottom + 28) + 58, backgroundColor: theme.control, opacity: pressed ? 0.8 : 1 },
            shadow,
          ]}
        >
          <Txt weight="semibold" style={{ color: theme.text, fontSize: 15 }}>
            Review
          </Txt>
          {admin.pending > 0 ? (
            <View style={[styles.countBadge, { backgroundColor: theme.accent }]}>
              <Txt weight="bold" style={{ color: theme.onAccent, fontSize: 12 }}>
                {admin.pending > 99 ? "99+" : admin.pending}
              </Txt>
            </View>
          ) : null}
        </Pressable>
      ) : null}

      <PrivacyReportSheet visible={reportOpen} theme={theme} onClose={() => setReportOpen(false)} />
      <InviteSheet visible={inviteOpen} theme={theme} onClose={() => setInviteOpen(false)} onMessage={showToast} />
      <BadgesSheet visible={badgesOpen} theme={theme} onClose={() => setBadgesOpen(false)} />

      <Paywall
        visible={paywall != null}
        theme={theme}
        reason={paywall?.reason}
        onClose={() => setPaywall(null)}
        onStarted={() => {
          setPaywall(null);
          showToast("Your 3-day free trial of DeCam GPS Pro has started.");
          setTimeout(() => load(regionRef.current), 150);
        }}
      />

      <SettingsSheet
        pro={pro}
        isAdmin={admin.isAdmin}
        onOpenInvite={() => {
          setSettingsOpen(false);
          setTimeout(() => setInviteOpen(true), 400);
        }}
        onOpenBadges={() => {
          setSettingsOpen(false);
          setTimeout(() => setBadgesOpen(true), 400);
        }}
        onOpenPrivacyReport={() => {
          setSettingsOpen(false);
          setTimeout(() => setReportOpen(true), 400);
        }}
        onOpenPro={() => {
          setSettingsOpen(false);
          setTimeout(() => openPaywall(), 400);
        }}
        visible={settingsOpen}
        theme={theme}
        voiceOn={!muted && isPro}
        onVoiceChange={(on) => {
          if (!isPro) {
            setSettingsOpen(false);
            setTimeout(() => openPaywall("Voice guidance is part of DeCam GPS Pro."), 400);
            return;
          }
          toggleMuted(!on);
        }}
        onClose={() => setSettingsOpen(false)}
        historyCount={places.recents.length}
        onClearHistory={() => {
          setPlaces((p) => clearRecents(p));
          showToast("History cleared.");
        }}
      />

      <ReviewScreen
        visible={reviewOpen}
        theme={theme}
        onClose={() => setReviewOpen(false)}
        onChanged={(pending) => {
          setAdmin((a) => ({ ...a, pending }));
          load(regionRef.current);
        }}
        onShowOnMap={(lat, lon) => {
          setReviewOpen(false);
          setSelected(null);
          mapRef.current?.animateToRegion({ latitude: lat, longitude: lon, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 500);
        }}
      />

      {reporting ? (
        <ReportSheet
          theme={theme}
          busy={reportBusy}
          error={reportError}
          onSubmit={submitReport}
          allowSpeed={isPro}
          onCancel={() => {
            setReporting(false);
            setReportError(null);
          }}
        />
      ) : navActive ? (
        <NavPanel
          theme={theme}
          update={navUpdate}
          route={navRoute}
          muted={muted || !isPro}
          locked={!isPro}
          onToggleMute={() => {
            if (!isPro) return openPaywall("Voice guidance is part of DeCam GPS Pro.");
            toggleMuted(!muted);
          }}
          onEnd={endNav}
          onLayoutHeight={setNavFooterH}
          onShare={() => {
            const n = navStateRef.current;
            if (!n) return;
            const eta = navUpdate ? arrivalTime(navUpdate.remainingSec) : null;
            Share.share({
              message:
                `I'm on my way to ${n.dest.name}${eta ? ` and should get there around ${eta}` : ""}.\n` +
                `https://maps.apple.com/?daddr=${n.dest.lat.toFixed(5)},${n.dest.lon.toFixed(5)}`,
            }).catch(() => {});
          }}
        />
      ) : inRouteMode && settingSlot === "stop" ? null : inRouteMode ? (
        <RouteSheet
          theme={theme}
          routes={routes ?? []}
          counts={routeCounts}
          speedCounts={isPro ? speedCounts : null}
          redCounts={isPro ? redCounts : null}
          countError={countError}
          selected={selectedRoute}
          onSelect={(i) => setSelectedRoute(i)}
          avoidTolls={avoidTolls}
          onToggleTolls={() => {
            const next = !avoidTolls;
            setAvoidTolls(next);
            if (searchPin) loadRoutes(searchPin, { tolls: next });
          }}
          avoidHighways={avoidHighways}
          onToggleHighways={() => {
            const next = !avoidHighways;
            setAvoidHighways(next);
            if (searchPin) loadRoutes(searchPin, { highways: next });
          }}
          leave={{ departAt, locked: !isPro, onPress: pickDeparture }}
          stops={{
            list: stops.map((x) => ({ id: x.id, name: x.name })),
            locked: !isPro,
            max: MAX_STOPS,
            onAdd: () => {
              if (!isPro) return openPaywall("Adding stops on the way is part of DeCam GPS Pro.");
              setSettingSlot("stop");
              setSearchFocus((n) => n + 1);
            },
            onRemove: removeStop,
          }}
          loading={routeLoading}
          error={routeError}
          searchingFewer={searchingFewer}
          onStart={() => {
            if (departAt && isPro && searchPin) {
              setDepartAt(null);
              loadRoutes(searchPin, { departAt: null });
              showToast("Showing routes for leaving now. Tap Start when you're ready.");
              return;
            }
            startNav();
          }}
          avoidAll={{
            on: avoidAll,
            extraMin,
            locked: false, // free for everyone
            onToggle: () => {
              const next = !avoidAll;
              setAvoidAll(next);
              avoidAllRef.current = { on: next, extraMin };
              if (searchPin) loadRoutes(searchPin);
            },
            onExtra: (m) => {
              setExtraMin(m);
              avoidAllRef.current = { on: avoidAll, extraMin: m };
              if (searchPin) loadRoutes(searchPin);
            },
          }}
        />
      ) : searchPin && !selected ? (
        <PlaceSheet
          place={searchPin}
          from={userLoc}
          theme={theme}
          loading={routeLoading}
          error={routeError}
          onDirections={() => loadRoutes(searchPin)}
          onClose={() => {
            setSearchPin(null);
            setRouteError(null);
          }}
        />
      ) : showCat && activeCat ? (
        <CategorySheet
          theme={theme}
          category={activeCat}
          results={catResults}
          loading={catLoading}
          error={catError}
          onPick={(p) => goToPlace(p)}
          onClose={() => pickCategory(null)}
          onLayoutHeight={setSheetH}
        />
      ) : showHome ? (
        <WhereToSheet
          theme={theme}
          places={places}
          etas={etas}
          nearbyCount={nearbyCount}
          onGo={goSaved}
          onSetSlot={(slot) => {
            setSettingSlot(slot);
            setSearchPin(null);
            setSearchFocus((n) => n + 1);
          }}
          onClearSlot={(slot) => setPlaces((p) => setSlot(p, slot, null))}
          onRemoveRecent={(id) => setPlaces((p) => removeRecent(p, id))}
          onLayoutHeight={setSheetH}
          favorites={{
            locked: !isPro,
            canAdd: places.favorites.length < MAX_FAVORITES,
            onAdd: () => {
              if (!isPro) return openPaywall("Saving more places (like Gym or Mom's house) is part of DeCam GPS Pro.");
              setSettingSlot("fav");
              setSearchPin(null);
              setSearchFocus((n) => n + 1);
            },
            onRename: (f) =>
              Alert.prompt(
                "Rename",
                f.name,
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Save", onPress: (label?: string) => label && setPlaces((p) => renameFavorite(p, f.id, label)) },
                ],
                "plain-text",
                f.label
              ),
            onRemove: (f) => setPlaces((p) => removeFavorite(p, f.id)),
          }}
          commute={
            places.home && places.work
              ? {
                  locked: !isPro,
                  status: commute,
                  onPress: () =>
                    isPro
                      ? places.work && goSaved(places.work)
                      : openPaywall("Commute watch is part of DeCam GPS Pro."),
                }
              : null
          }
        />
      ) : null}

      {selectedAlert && !reporting && !selected ? (
        <RoadAlertSheet
          key={selectedAlert.id}
          alert={selectedAlert}
          theme={theme}
          onClose={() => setSelectedAlert(null)}
          onMessage={showToast}
          onChanged={() => {
            const r = regionRef.current;
            fetchRoadAlerts(boundsForRegion(r)).then(setAlerts).catch(() => {});
          }}
        />
      ) : null}

      {/* Camera details sit above everything else, including route previews. */}
      <CameraSheet
        point={reporting ? null : selected}
        theme={theme}
        onClose={() => setSelected(null)}
        onChanged={() => load(regionRef.current)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { position: "absolute", left: 16, right: 16, gap: 10 },
  toast: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  controls: { position: "absolute", right: 16, borderRadius: 16 },
  policeHint: {
    position: "absolute",
    left: 16,
    height: 44,
    paddingLeft: 6,
    paddingRight: 10,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  policeDot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  proMini: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  stopPin: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  gear: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  controlButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  attribution: { position: "absolute", right: 12 },
  countBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  settingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  settingClose: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  reportButton: {
    position: "absolute",
    right: 16,
    height: 48,
    paddingLeft: 14,
    paddingRight: 18,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
