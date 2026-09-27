import { memo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CATEGORIES, type CategoryId, type CategoryPlace } from "../lib/categories";
import type { Theme } from "../theme";
import {
  BurgerIcon,
  CartIcon,
  CloseIcon,
  CupIcon,
  ForkKnifeIcon,
  FuelIcon,
  ParkingIcon,
  PharmacyIcon,
  PlugIcon,
} from "./Icons";
import { Txt } from "./Txt";

type T = Theme & { isDark: boolean };

export function CategoryIcon({ id, size = 18, color }: { id: CategoryId; size?: number; color: string }) {
  switch (id) {
    case "gas":
      return <FuelIcon size={size} color={color} />;
    case "fast_food":
      return <BurgerIcon size={size} color={color} />;
    case "restaurant":
      return <ForkKnifeIcon size={size} color={color} />;
    case "grocery":
      return <CartIcon size={size} color={color} />;
    case "coffee":
      return <CupIcon size={size} color={color} />;
    case "ev":
      return <PlugIcon size={size} color={color} />;
    case "parking":
      return <ParkingIcon size={size} color={color} />;
    case "pharmacy":
      return <PharmacyIcon size={size} color={color} />;
  }
}

/** Scrollable row of category chips under the search bar. */
export function CategoryChips({
  theme,
  active,
  onPick,
}: {
  theme: T;
  active: CategoryId | null;
  onPick: (id: CategoryId | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 8, paddingRight: 16 }}
      style={{ marginHorizontal: -16, paddingLeft: 16, flexGrow: 0 }}
    >
      {CATEGORIES.map((c) => {
        const on = c.id === active;
        return (
          <Pressable
            key={c.id}
            onPress={() => onPick(on ? null : c.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${c.title} nearby`}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: on ? theme.accent : theme.control,
                opacity: pressed ? 0.8 : 1,
                shadowColor: theme.shadowColor,
                shadowOpacity: theme.isDark ? 0.35 : 0.1,
              },
            ]}
          >
            <CategoryIcon id={c.id} size={16} color={on ? theme.onAccent : theme.accentIcon} />
            <Txt weight="semibold" style={{ fontSize: 14, color: on ? theme.onAccent : theme.text }}>
              {c.label}
            </Txt>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Map pin for a category result: white disc with the category icon. */
export const CategoryPin = memo(function CategoryPin({
  place,
  theme,
  onPress,
}: {
  place: CategoryPlace;
  theme: T;
  onPress: (p: CategoryPlace) => void;
}) {
  return (
    <Marker
      key={`cp-${place.id}-${theme.isDark ? "d" : "l"}`}
      coordinate={{ latitude: place.lat, longitude: place.lon }}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={(e) => {
        e.stopPropagation();
        onPress(place);
      }}
      tracksViewChanges={false}
      zIndex={700}
      accessibilityLabel={place.name}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: theme.control,
          borderWidth: 2,
          borderColor: theme.accentIcon,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CategoryIcon id={place.category} size={16} color={theme.accentIcon} />
      </View>
    </Marker>
  );
});

function miles(m: number | null) {
  if (m == null) return null;
  const mi = m / 1609.344;
  return mi < 0.1 ? "nearby" : `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

/** Bottom sheet listing the results for the active category. */
export function CategorySheet({
  theme,
  category,
  results,
  loading,
  error,
  onPick,
  onClose,
  onLayoutHeight,
}: {
  theme: T;
  category: CategoryId;
  results: CategoryPlace[];
  loading: boolean;
  error: string | null;
  onPick: (p: CategoryPlace) => void;
  onClose: () => void;
  onLayoutHeight: (h: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const def = CATEGORIES.find((c) => c.id === category)!;
  return (
    <View
      onLayout={(e) => onLayoutHeight(e.nativeEvent.layout.height)}
      style={[
        styles.sheet,
        {
          backgroundColor: theme.surface,
          paddingBottom: Math.max(insets.bottom, 16) + 6,
          shadowColor: theme.shadowColor,
          shadowOpacity: theme.isDark ? 0.45 : 0.1,
        },
      ]}
    >
      <View style={[styles.handle, { backgroundColor: theme.handle }]} />
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Txt weight="bold" style={{ fontSize: 20, color: theme.text }}>
            {def.title}
          </Txt>
          <Txt style={{ fontSize: 13, color: theme.textSecondary }}>
            {loading ? "Searching this area…" : results.length ? `${results.length} in this area` : "None found here"}
          </Txt>
        </View>
        {loading ? <ActivityIndicator color={theme.textSecondary} /> : null}
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
      {!loading && !error && results.length === 0 ? (
        <Txt style={{ color: theme.textSecondary, fontSize: 14 }}>Move or zoom out the map to search a wider area.</Txt>
      ) : null}
      <ScrollView style={{ maxHeight: 250 }} keyboardShouldPersistTaps="handled">
        {results.map((r, i) => (
          <Pressable
            key={r.id + i}
            onPress={() => onPick(r)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: pressed ? theme.subtle : "transparent",
                borderTopColor: theme.divider,
                borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth * 2,
              },
            ]}
          >
            <View style={[styles.rowIcon, { backgroundColor: theme.subtle }]}>
              <CategoryIcon id={r.category} size={17} color={theme.accentIcon} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt weight="semibold" numberOfLines={1} style={{ fontSize: 16, color: theme.text }}>
                {r.name}
              </Txt>
              {r.subtitle ? (
                <Txt numberOfLines={1} style={{ fontSize: 13, color: theme.textSecondary }}>
                  {r.subtitle}
                </Txt>
              ) : null}
            </View>
            {miles(r.distanceM) ? (
              <Txt weight="semibold" style={{ fontSize: 13, color: theme.textSecondary }}>
                {miles(r.distanceM)}
              </Txt>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
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
    gap: 10,
  },
  handle: { width: 40, height: 5, borderRadius: 3, alignSelf: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
