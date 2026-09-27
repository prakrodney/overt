import { useState } from "react";
import { ActionSheetIOS, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatDuration } from "../lib/directions";
import type { SavedPlace, SavedPlaces } from "../lib/savedPlaces";
import type { Theme } from "../theme";
import { ClockIcon, CloseIcon, HomeIcon, WorkIcon } from "./Icons";
import { Txt } from "./Txt";

type T = Theme & { isDark: boolean };
type Slot = "home" | "work";

/** Home board's bottom sheet: "Where to?", Home / Work tiles and recent places. */
export function WhereToSheet({
  theme,
  places,
  etas,
  nearbyCount,
  onGo,
  onSetSlot,
  onClearSlot,
  onRemoveRecent,
  onLayoutHeight,
}: {
  theme: T;
  places: SavedPlaces;
  /** Drive time in seconds to Home / Work, when known. */
  etas: { home?: number; work?: number };
  nearbyCount: number | null;
  onGo: (p: SavedPlace) => void;
  onSetSlot: (slot: Slot) => void;
  onClearSlot: (slot: Slot) => void;
  onRemoveRecent: (id: string) => void;
  onLayoutHeight: (h: number) => void;
}) {
  const insets = useSafeAreaInsets();
  // Show the 2 latest; "Show all" opens the full list (up to 10) in a scrolling area.
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? places.recents : places.recents.slice(0, 2);

  const slotMenu = (slot: Slot) => {
    const label = slot === "home" ? "Home" : "Work";
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [`Change ${label}`, `Remove ${label}`, "Cancel"],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
        userInterfaceStyle: theme.isDark ? "dark" : "light",
      },
      (i) => {
        if (i === 0) onSetSlot(slot);
        if (i === 1) onClearSlot(slot);
      }
    );
  };

  const tile = (slot: Slot) => {
    const p = places[slot];
    const label = slot === "home" ? "Home" : "Work";
    const Icon = slot === "home" ? HomeIcon : WorkIcon;
    const eta = etas[slot];
    const sub = !p ? "Tap to set" : eta != null ? formatDuration(eta) : p.subtitle || p.name;
    return (
      <Pressable
        key={slot}
        onPress={() => (p ? onGo(p) : onSetSlot(slot))}
        onLongPress={() => p && slotMenu(slot)}
        accessibilityRole="button"
        accessibilityLabel={p ? `${label}, ${sub}` : `Set ${label}`}
        accessibilityHint={p ? "Shows routes. Long-press to change or remove." : undefined}
        style={({ pressed }) => [styles.tile, { backgroundColor: theme.subtle, opacity: pressed ? 0.75 : 1 }]}
      >
        <Icon color={theme.accentIcon} />
        <Txt weight="semibold" style={{ fontSize: 16, color: theme.text }}>
          {label}
        </Txt>
        <Txt style={{ fontSize: 13, color: theme.textSecondary }} numberOfLines={1}>
          {sub}
        </Txt>
      </Pressable>
    );
  };

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
        <Txt weight="bold" style={{ fontSize: 20, letterSpacing: -0.2, color: theme.text }}>
          Where to?
        </Txt>
        {nearbyCount != null ? (
          <Txt style={{ fontSize: 13, color: theme.textSecondary }}>
            {nearbyCount === 0
              ? "None documented in view"
              : `${nearbyCount.toLocaleString("en-US")} documented in view`}
          </Txt>
        ) : null}
      </View>
      <View style={styles.tiles}>{(["home", "work"] as const).map(tile)}</View>
      <ScrollView style={{ maxHeight: showAll ? 300 : undefined }} contentContainerStyle={{ gap: 14 }} scrollEnabled={showAll}>
      {shown.map((r) => (
        <Pressable
          key={r.id}
          onPress={() => onGo(r)}
          onLongPress={() =>
            ActionSheetIOS.showActionSheetWithOptions(
              {
                options: ["Remove from recents", "Cancel"],
                destructiveButtonIndex: 0,
                cancelButtonIndex: 1,
                userInterfaceStyle: theme.isDark ? "dark" : "light",
              },
              (i) => i === 0 && onRemoveRecent(r.id)
            )
          }
          accessibilityRole="button"
          accessibilityLabel={`${r.name}, recent`}
          style={({ pressed }) => [styles.recent, { opacity: pressed ? 0.6 : 1 }]}
        >
          <View style={[styles.recentIcon, { backgroundColor: theme.subtle }]}>
            <ClockIcon color={theme.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt weight="semibold" numberOfLines={1} style={{ fontSize: 15, color: theme.text }}>
              {r.name}
            </Txt>
            {r.subtitle ? (
              <Txt numberOfLines={1} style={{ fontSize: 13, color: theme.textSecondary }}>
                {r.subtitle}
              </Txt>
            ) : null}
          </View>
          <Pressable
            onPress={() => onRemoveRecent(r.id)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${r.name} from history`}
            hitSlop={10}
            style={({ pressed }) => [styles.removeBtn, { backgroundColor: theme.closeBg, opacity: pressed ? 0.6 : 1 }]}
          >
            <CloseIcon size={12} color={theme.textSecondary} />
          </Pressable>
        </Pressable>
      ))}
      </ScrollView>
      {places.recents.length > 2 ? (
        <Pressable
          onPress={() => setShowAll((v) => !v)}
          accessibilityRole="button"
          hitSlop={6}
          style={({ pressed }) => ({ alignSelf: "flex-start", opacity: pressed ? 0.6 : 1 })}
        >
          <Txt weight="semibold" style={{ fontSize: 14, color: theme.accentIcon }}>
            {showAll ? "Show less" : `Show all ${places.recents.length} recent places`}
          </Txt>
        </Pressable>
      ) : null}
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
    gap: 14,
  },
  handle: { width: 40, height: 5, borderRadius: 3, alignSelf: "center" },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  tiles: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, padding: 14, borderRadius: 16, gap: 6 },
  recent: { flexDirection: "row", alignItems: "center", gap: 12 },
  removeBtn: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  recentIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
