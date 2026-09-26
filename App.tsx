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
import { Keyboard, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraMarker, ClusterMarker, DirectionCones } from "./src/components/CameraMarkers";
import { CameraSheet } from "./src/components/CameraSheet";
import { LocateIcon } from "./src/components/Icons";
import { SearchBar } from "./src/components/SearchBar";
import { Txt } from "./src/components/Txt";
import { fetchCameraLayer, type CameraCluster, type CameraLayer, type CameraPoint } from "./src/lib/cameras";
import type { Place } from "./src/lib/geocode";
import { boundsForRegion, zoomForRegion } from "./src/lib/geo";
import { useTheme } from "./src/theme";

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
  const [searchPin, setSearchPin] = useState<Place | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
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

  useEffect(() => {
    flyToUser(false).catch(() => setLocationDenied(true));
  }, [flyToUser]);

  // ---- Load cameras for the visible area -------------------------------------
  const load = useCallback(
    (r: Region) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      fetchCameraLayer(boundsForRegion(r), zoomForRegion(r, width), ctrl.signal)
        .then((l) => {
          setLayer(l);
          setLoadError(null);
        })
        .catch((e) => {
          if (e?.name !== "AbortError") setLoadError("Couldn't load cameras. Check your connection.");
        });
    },
    [width]
  );

  // First paint: nationwide clusters, even before location permission resolves.
  useEffect(() => {
    load(US_REGION);
  }, [load]);

  const onRegionChangeComplete = useCallback(
    (r: Region) => {
      setRegion(r);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => load(r), 200);
    },
    [load]
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
    setSelected(null);
    setSearchPin(place);
    if (place.extent) {
      const [minLon, maxLat, maxLon, minLat] = place.extent;
      mapRef.current?.fitToCoordinates(
        [
          { latitude: minLat, longitude: minLon },
          { latitude: maxLat, longitude: maxLon },
        ],
        { edgePadding: { top: 160, bottom: 80, left: 40, right: 40 }, animated: true }
      );
    } else {
      mapRef.current?.animateToRegion(
        { latitude: place.lat, longitude: place.lon, latitudeDelta: 0.012, longitudeDelta: 0.012 },
        600
      );
    }
  }, []);

  const showCones = zoom >= 13;
  const shadow = {
    shadowColor: theme.shadowColor,
    shadowOpacity: theme.isDark ? 0.4 : 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  };

  return (
    <View style={[styles.fill, { backgroundColor: theme.mapFallback }]}>
      <StatusBar style={theme.isDark ? "light" : "dark"} />
      <MapView
        ref={mapRef}
        style={styles.fill}
        initialRegion={US_REGION}
        onRegionChangeComplete={onRegionChangeComplete}
        onPress={() => {
          Keyboard.dismiss();
          setSelected(null);
        }}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterests={false}
        showsBuildings={false}
        pitchEnabled={false}
        mapType="mutedStandard"
        userInterfaceStyle={theme.isDark ? "dark" : "light"}
        tintColor={theme.accent}
        legalLabelInsets={{ top: 0, right: 0, left: 12, bottom: selected ? 0 : insets.bottom }}
      >
        {showCones ? (
          <DirectionCones points={layer.points} selectedId={selected?.id ?? null} zoom={zoom} theme={theme} />
        ) : null}
        {layer.clusters.map((c) => (
          <ClusterMarker key={`${c.id}-${c.count}`} cluster={c} theme={theme} onPress={zoomIntoCluster} />
        ))}
        {layer.points.map((p) => (
          <CameraMarker
            key={p.id}
            point={p}
            selected={p.id === selected?.id}
            theme={theme}
            onPress={selectPoint}
          />
        ))}
        {searchPin ? (
          <Marker
            coordinate={{ latitude: searchPin.lat, longitude: searchPin.lon }}
            title={searchPin.name}
            description={searchPin.subtitle}
            pinColor={theme.accent}
          />
        ) : null}
      </MapView>

      {/* Recenter */}
      <View style={[styles.controls, { top: insets.top + 74, backgroundColor: theme.control }, shadow]}>
        <Pressable
          onPress={() => flyToUser(true)}
          accessibilityRole="button"
          accessibilityLabel="Show my location"
          style={({ pressed }) => [styles.controlButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <LocateIcon color={theme.accentIcon} />
        </Pressable>
      </View>

      {/* Search */}
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <SearchBar
          theme={theme}
          near={userLoc ?? { lat: region.latitude, lon: region.longitude }}
          onSelect={goToPlace}
          onClear={() => setSearchPin(null)}
        />
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
      {!selected ? (
        <View style={[styles.attribution, { bottom: insets.bottom + 4 }]} pointerEvents="none">
          <Txt style={{ fontSize: 10, color: theme.textSecondary }}>Camera data © OpenStreetMap contributors</Txt>
        </View>
      ) : null}

      <CameraSheet point={selected} theme={theme} onClose={() => setSelected(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { position: "absolute", left: 16, right: 16, gap: 10 },
  toast: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  controls: { position: "absolute", right: 16, borderRadius: 16 },
  controlButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  attribution: { position: "absolute", right: 12 },
});
