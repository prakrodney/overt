import { useSyncExternalStore } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";

// Colors lifted from the Overt screen designs (light + dark boards).
const light = {
  mapFallback: "#EEEDE9",
  text: "#1B1D22",
  textSecondary: "#5A5F69",
  surface: "#FFFFFF", // sheets
  control: "#FFFFFF", // search pill, floating buttons
  subtle: "#F4F3F0", // result rows / tiles
  closeBg: "#F1F0ED",
  divider: "#ECEBE7",
  handle: "#D9D7D2",
  outline: "#D9D7D2",
  accent: "#4A4FD6",
  accentIcon: "#4A4FD6",
  onAccent: "#FFFFFF",
  badgeBg: "#E9EAFB",
  badgeText: "#3438A8",
  markerFill: "#3F4756",
  markerStroke: "#FFFFFF",
  markerGlyph: "#FFFFFF",
  markerMutedFill: "#F6F5F2",
  clusterFill: "rgba(224,53,43,0.85)", // zoomed-out dots (same red as the cones)
  clusterStroke: "rgba(255,255,255,0.9)",
  markerMutedStroke: "#9EA3AC",
  cone: "rgba(224,53,43,0.30)",
  coneStroke: "rgba(224,53,43,0.55)",
  // Speed cameras: amber, so they never read as ALPRs.
  speedFill: "#B45F00",
  speedStroke: "#FFFFFF",
  speedGlyph: "#FFFFFF",
  speedCone: "rgba(226,132,0,0.30)",
  speedConeStroke: "rgba(226,132,0,0.60)",
  speedClusterFill: "rgba(214,120,0,0.9)",
  // Red-light cameras: magenta, distinct from ALPR red cones and amber speed cameras.
  redLightFill: "#B0186E",
  redLightGlyph: "#FFFFFF",
  redLightClusterFill: "rgba(176,24,110,0.88)",
  // Live road alerts
  policeFill: "#2458E6",
  crashFill: "#D93025",
  hazardFill: "#F2B705",
  alertGlyph: "#FFFFFF",
  hazardGlyph: "#1B1D22",
  alertStroke: "#FFFFFF",
  selectHalo: "rgba(74,79,214,0.14)",
  shadowColor: "#1B1D22",
  shadowOpacity: 0.14,
  // Route preview (Route board)
  route: "#4A4FD6",
  routeToStop: "#0F9D84", // the stretch to your next stop while navigating
  routeCamGlow: "rgba(255,59,48,0.28)", // halo around plate readers on the chosen route
  routeCamRing: "#FF3B30",
  routeAlt: "#A3A8B4",
  routeCasing: "#FFFFFF",
  routeCardSelectedBg: "#F6F6FE",
  destination: "#1B1D22",
  destinationInner: "#FFFFFF",
  goodBg: "#E3F3E9",
  goodText: "#17663A",
  mixedBg: "#FFF0D1",
  mixedText: "#7A4E00",
  badBg: "#FCE6E4",
  badText: "#A3231B",
};

const dark: typeof light = {
  mapFallback: "#1B1D21",
  text: "#F2F3F5",
  textSecondary: "#A2A7B0",
  surface: "#202226",
  control: "#26292E",
  subtle: "#2A2D33",
  closeBg: "#2E3137",
  divider: "#33363C",
  handle: "#464A52",
  outline: "#464A52",
  accent: "#5B60E8",
  accentIcon: "#9A9EFF",
  onAccent: "#FFFFFF",
  badgeBg: "#2E3160",
  badgeText: "#C4C6FF",
  markerFill: "#D5D9E0",
  markerStroke: "#1B1D21",
  markerGlyph: "#1B1D21",
  markerMutedFill: "#24272C",
  clusterFill: "rgba(255,90,78,0.85)",
  clusterStroke: "rgba(27,29,33,0.9)",
  markerMutedStroke: "#6E747E",
  cone: "rgba(255,90,78,0.35)",
  coneStroke: "rgba(255,90,78,0.60)",
  speedFill: "#F5A524",
  speedStroke: "#1B1D21",
  speedGlyph: "#1B1D21",
  speedCone: "rgba(245,165,36,0.32)",
  speedConeStroke: "rgba(245,165,36,0.65)",
  speedClusterFill: "rgba(245,165,36,0.9)",
  redLightFill: "#F06BB5",
  redLightGlyph: "#1B1D21",
  redLightClusterFill: "rgba(240,107,181,0.9)",
  policeFill: "#5B86FF",
  crashFill: "#FF6B5E",
  hazardFill: "#FFD23F",
  alertGlyph: "#FFFFFF",
  hazardGlyph: "#1B1D22",
  alertStroke: "#1B1D21",
  selectHalo: "rgba(123,128,255,0.18)",
  shadowColor: "#000000",
  shadowOpacity: 0.4,
  route: "#7B80FF",
  routeToStop: "#2CC9A8",
  routeCamGlow: "rgba(255,90,78,0.35)",
  routeCamRing: "#FF5A4E",
  routeAlt: "#5E636D",
  routeCasing: "#1B1D21",
  routeCardSelectedBg: "#25274A",
  destination: "#F2F3F5",
  destinationInner: "#1B1D21",
  goodBg: "#183826",
  goodText: "#7FE0A6",
  mixedBg: "#3A2E14",
  mixedText: "#F5C76A",
  badBg: "#43201D",
  badText: "#FF9A91",
};

export type Theme = typeof light;

// ---- Appearance setting: follow the iPhone, or always light / always dark ----------
export type Appearance = "system" | "light" | "dark";
const APPEARANCE_KEY = "overt.appearance.v1";
let appearance: Appearance = "system";
const listeners = new Set<() => void>();

SecureStore.getItemAsync(APPEARANCE_KEY)
  .then((v) => {
    if (v === "light" || v === "dark" || v === "system") setAppearance(v, false);
  })
  .catch(() => {});

export function setAppearance(a: Appearance, save = true) {
  appearance = a;
  listeners.forEach((l) => l());
  if (save) SecureStore.setItemAsync(APPEARANCE_KEY, a).catch(() => {});
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => appearance
  );
}

export function useTheme(): Theme & { isDark: boolean } {
  const system = useColorScheme();
  const pref = useAppearance();
  const isDark = pref === "system" ? system === "dark" : pref === "dark";
  return { ...(isDark ? dark : light), isDark };
}

// Figtree, loaded in App.tsx via @expo-google-fonts/figtree.
export const fonts = {
  regular: "Figtree_400Regular",
  medium: "Figtree_500Medium",
  semibold: "Figtree_600SemiBold",
  bold: "Figtree_700Bold",
  extrabold: "Figtree_800ExtraBold",
};
