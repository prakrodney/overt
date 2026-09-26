import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Place } from "../lib/geocode";
import type { Theme } from "../theme";
import { CloseIcon, DirectionsIcon } from "./Icons";
import { Txt } from "./Txt";

type T = Theme & { isDark: boolean };

function milesBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Search result sheet: name, address, distance and a Directions button. */
export function PlaceSheet({
  place,
  from,
  theme,
  loading,
  error,
  onDirections,
  onClose,
}: {
  place: Place;
  from: { lat: number; lon: number } | null;
  theme: T;
  loading: boolean;
  error: string | null;
  onDirections: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const miles = from ? milesBetween(from, place) : null;
  const meta = [place.subtitle, miles != null ? `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away` : null]
    .filter(Boolean)
    .join(" · ");

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
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt weight="bold" style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {place.name}
          </Txt>
          {meta ? (
            <Txt style={{ color: theme.textSecondary, fontSize: 15 }} numberOfLines={2}>
              {meta}
            </Txt>
          ) : null}
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          style={[styles.close, { backgroundColor: theme.closeBg }]}
        >
          <CloseIcon color={theme.text} />
        </Pressable>
      </View>

      {error ? <Txt style={{ color: theme.badText, fontSize: 14 }}>{error}</Txt> : null}

      <Pressable
        onPress={onDirections}
        disabled={loading}
        accessibilityRole="button"
        style={({ pressed }) => [styles.primary, { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 }]}
      >
        {loading ? (
          <ActivityIndicator color={theme.onAccent} />
        ) : (
          <>
            <DirectionsIcon color={theme.onAccent} />
            <Txt weight="bold" style={{ color: theme.onAccent, fontSize: 17 }}>
              Directions
            </Txt>
          </>
        )}
      </Pressable>
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
    gap: 16,
  },
  handle: { width: 40, height: 5, borderRadius: 3, alignSelf: "center" },
  header: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  title: { fontSize: 22, lineHeight: 26, letterSpacing: -0.3 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  primary: {
    height: 54,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
