import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatDuration, formatMiles, type RouteOption } from "../lib/directions";
import type { Theme } from "../theme";
import { BackIcon, CameraFilledIcon, CheckIcon, DirectionsIcon, TollIcon, WarnIcon } from "./Icons";
import { Txt } from "./Txt";

type T = Theme & { isDark: boolean };
type Rating = "good" | "mixed" | "bad";

/** Label each route by how many documented cameras it passes, relative to the others. */
function ratings(counts: number[]): Rating[] {
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  return counts.map((c) => {
    if (min === max) return c === 0 ? "good" : "mixed";
    if (c === min) return "good";
    if (c === max) return "bad";
    return "mixed";
  });
}

const LABEL: Record<Rating, string> = { good: "Safest", mixed: "Mixed", bad: "Unsafe" };

function Badge({ rating, theme }: { rating: Rating; theme: T }) {
  const bg = rating === "good" ? theme.goodBg : rating === "mixed" ? theme.mixedBg : theme.badBg;
  const fg = rating === "good" ? theme.goodText : rating === "mixed" ? theme.mixedText : theme.badText;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {rating === "good" ? (
        <CheckIcon color={fg} />
      ) : rating === "mixed" ? (
        <CameraFilledIcon color={fg} />
      ) : (
        <WarnIcon color={fg} />
      )}
      <Txt weight="bold" style={{ color: fg, fontSize: 13 }}>
        {LABEL[rating]}
      </Txt>
    </View>
  );
}

function cameraText(n: number | undefined) {
  if (n === undefined) return "Counting cameras…";
  if (n === 0) return "No cameras";
  return n === 1 ? "1 camera" : `${n} cameras`;
}

/** Route preview sheet (Route board): route cards with ETA, distance, tolls and camera count. */
export function RouteSheet({
  theme,
  routes,
  counts,
  countError,
  selected,
  onSelect,
  avoidTolls,
  onToggleTolls,
  loading,
  error,
}: {
  theme: T;
  routes: RouteOption[];
  counts: number[] | null;
  countError: string | null;
  selected: number;
  onSelect: (i: number) => void;
  avoidTolls: boolean;
  onToggleTolls: () => void;
  loading: boolean;
  error: string | null;
}) {
  const insets = useSafeAreaInsets();
  const [startNote, setStartNote] = useState(false);
  const rated = counts ? ratings(counts) : null;

  return (
    <View
      style={[
        styles.sheet,
        {
          backgroundColor: theme.surface,
          paddingBottom: Math.max(insets.bottom, 16) + 8,
          shadowColor: theme.shadowColor,
          shadowOpacity: theme.isDark ? 0.45 : 0.12,
        },
      ]}
    >
      <View style={[styles.handle, { backgroundColor: theme.handle }]} />
      <View style={styles.titleRow}>
        <Txt weight="bold" style={[styles.title, { color: theme.text }]}>
          {loading ? "Finding routes…" : routes.length === 1 ? "1 route" : `${routes.length} routes`}
        </Txt>
        <Pressable
          onPress={onToggleTolls}
          accessibilityRole="switch"
          accessibilityState={{ checked: avoidTolls }}
          style={[
            styles.chip,
            avoidTolls
              ? { backgroundColor: theme.badgeBg, borderColor: theme.accentIcon }
              : { backgroundColor: theme.surface, borderColor: theme.outline },
          ]}
        >
          <TollIcon color={avoidTolls ? theme.badgeText : theme.text} />
          <Txt weight="semibold" style={{ fontSize: 14, color: avoidTolls ? theme.badgeText : theme.text }}>
            Avoid tolls
          </Txt>
        </Pressable>
      </View>

      {error ? <Txt style={{ color: theme.badText, fontSize: 14 }}>{error}</Txt> : null}
      {countError ? (
        <Txt style={{ color: theme.textSecondary, fontSize: 13 }}>{countError}</Txt>
      ) : null}

      {loading && routes.length === 0 ? (
        <View style={{ paddingVertical: 24 }}>
          <ActivityIndicator color={theme.textSecondary} />
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 12 }}>
          {routes.map((r, i) => {
            const isSel = i === selected;
            const meta = [formatMiles(r.distanceM), r.hasToll ? "Toll road" : null, cameraText(counts?.[i])]
              .filter(Boolean)
              .join(" · ");
            return (
              <Pressable
                key={r.id}
                onPress={() => onSelect(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={`${formatDuration(r.durationSec)}, ${meta}`}
                style={[
                  styles.card,
                  isSel
                    ? { borderWidth: 2, borderColor: theme.route, backgroundColor: theme.routeCardSelectedBg }
                    : { borderWidth: 1.5, borderColor: theme.divider },
                ]}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Txt weight="bold" style={{ fontSize: 20, color: theme.text }}>
                    {formatDuration(r.durationSec)}
                  </Txt>
                  <Txt style={{ fontSize: 14, color: theme.textSecondary }} numberOfLines={1}>
                    {meta}
                  </Txt>
                </View>
                {rated ? <Badge rating={rated[i]} theme={theme} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {startNote ? (
        <Txt style={{ color: theme.textSecondary, fontSize: 13, textAlign: "center" }}>
          Turn-by-turn navigation arrives with the Mapbox navigation build, which can't run inside Expo Go.
        </Txt>
      ) : null}
      <Pressable
        onPress={() => setStartNote(true)}
        disabled={routes.length === 0}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.primary,
          { backgroundColor: theme.accent, opacity: routes.length === 0 ? 0.5 : pressed ? 0.85 : 1 },
        ]}
      >
        <DirectionsIcon color={theme.onAccent} />
        <Txt weight="bold" style={{ color: theme.onAccent, fontSize: 17 }}>
          Start
        </Txt>
      </Pressable>
    </View>
  );
}

/** Top card in route mode: back button, from → to. */
export function RouteHeader({ theme, destination, onBack }: { theme: T; destination: string; onBack: () => void }) {
  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: theme.control,
          shadowColor: theme.shadowColor,
          shadowOpacity: theme.isDark ? 0.4 : 0.12,
        },
      ]}
    >
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={6} style={styles.back}>
        <BackIcon color={theme.text} />
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.endpoint}>
          <View style={[styles.dot, { backgroundColor: theme.route, borderRadius: 4 }]} />
          <Txt style={{ fontSize: 15, color: theme.textSecondary }}>Current location</Txt>
        </View>
        <View style={{ height: 1, backgroundColor: theme.divider, marginLeft: 18 }} />
        <View style={styles.endpoint}>
          <View style={[styles.dot, { backgroundColor: theme.destination, borderRadius: 2 }]} />
          <Txt weight="semibold" style={{ fontSize: 15, color: theme.text, flex: 1 }} numberOfLines={1}>
            {destination}
          </Txt>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -8 },
    gap: 12,
  },
  handle: { width: 40, height: 5, borderRadius: 3, alignSelf: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: 20, letterSpacing: -0.2 },
  chip: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  card: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 999,
  },
  primary: {
    height: 54,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 6 },
  },
  back: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  endpoint: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 8, height: 8 },
});
