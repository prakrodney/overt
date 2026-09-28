import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Theme } from "../theme";
import { CameraGlyph, SpeedGlyph, TrafficLightGlyph } from "./Icons";
import { Txt } from "./Txt";

type T = Theme & { isDark: boolean };

const DIRECTIONS: { label: string; deg: number | null }[] = [
  { label: "N", deg: 0 },
  { label: "NE", deg: 45 },
  { label: "E", deg: 90 },
  { label: "SE", deg: 135 },
  { label: "S", deg: 180 },
  { label: "SW", deg: 225 },
  { label: "W", deg: 270 },
  { label: "NW", deg: 315 },
  { label: "Not sure", deg: null },
];

/** Report flow sheet: type → optional facing → submit. The pin is the map's centre. */
export function ReportSheet({
  theme,
  busy,
  error,
  onSubmit,
  onCancel,
  allowSpeed = true,
}: {
  theme: T;
  busy: boolean;
  error: string | null;
  onSubmit: (directionDeg: number | null, category: "alpr" | "speed_camera" | "red_light") => void;
  onCancel: () => void;
  /** Speed cameras are a Pro feature; free users report plate readers only. */
  allowSpeed?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [dir, setDir] = useState<number | null>(null);
  const [kind, setKind] = useState<"alpr" | "speed_camera" | "red_light">("alpr");

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
      <View style={{ gap: 4 }}>
        <Txt weight="bold" style={{ fontSize: 20, letterSpacing: -0.2, color: theme.text }}>
          Report equipment
        </Txt>
        <Txt style={{ fontSize: 14, color: theme.textSecondary }}>
          Move the map so the pin sits on the camera. You need to be within 300 m of it.
        </Txt>
      </View>

      <View style={{ gap: 8 }}>
        <Txt weight="semibold" style={[styles.label, { color: theme.textSecondary }]}>
          TYPE
        </Txt>
        <View style={styles.wrap}>
          {(
            [
              { k: "alpr", label: "Plate reader (ALPR)" },
              { k: "speed_camera", label: "Speed camera" },
              { k: "red_light", label: "Red-light camera" },
            ] as const
          )
            .filter((x) => allowSpeed || x.k === "alpr")
            .map(({ k, label }) => {
            const on = kind === k;
            return (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[
                  styles.chip,
                  styles.typeChip,
                  on
                    ? { backgroundColor: theme.badgeBg, borderColor: theme.accentIcon }
                    : { backgroundColor: theme.surface, borderColor: theme.outline },
                ]}
              >
                <View
                  style={[
                    styles.glyph,
                    { backgroundColor: k === "alpr" ? theme.markerFill : k === "red_light" ? theme.redLightFill : theme.speedFill },
                  ]}
                >
                  {k === "alpr" ? (
                    <CameraGlyph size={10} color={theme.markerGlyph} />
                  ) : (
                    k === "red_light" ? (
                      <TrafficLightGlyph size={12} color={theme.redLightGlyph} />
                    ) : (
                      <SpeedGlyph size={12} color={theme.speedGlyph} />
                    )
                  )}
                </View>
                <Txt weight="semibold" style={{ color: on ? theme.badgeText : theme.text, fontSize: 15 }}>
                  {label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Txt weight="semibold" style={[styles.label, { color: theme.textSecondary }]}>
          WHICH WAY DOES IT FACE? (OPTIONAL)
        </Txt>
        <View style={styles.wrap}>
          {DIRECTIONS.map((d) => {
            const on = dir === d.deg;
            return (
              <Pressable
                key={d.label}
                onPress={() => setDir(d.deg)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[
                  styles.chip,
                  on
                    ? { backgroundColor: theme.badgeBg, borderColor: theme.accentIcon }
                    : { backgroundColor: theme.surface, borderColor: theme.outline },
                ]}
              >
                <Txt weight="semibold" style={{ fontSize: 14, color: on ? theme.badgeText : theme.text }}>
                  {d.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? <Txt style={{ color: theme.badText, fontSize: 14 }}>{error}</Txt> : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            { borderWidth: 1.5, borderColor: theme.outline, backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Txt weight="semibold" style={{ color: theme.text, fontSize: 16 }}>
            Cancel
          </Txt>
        </Pressable>
        <Pressable
          onPress={() => onSubmit(dir, kind)}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, { backgroundColor: theme.accent, opacity: pressed || busy ? 0.85 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator color={theme.onAccent} />
          ) : (
            <Txt weight="bold" style={{ color: theme.onAccent, fontSize: 16 }}>
              Submit
            </Txt>
          )}
        </Pressable>
      </View>
    </View>
  );
}

/** Fixed pin drawn over the map's centre while placing a report. */
export function PlacementPin({ theme }: { theme: T }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.pinWrap}>
        <View
          style={[
            styles.pin,
            { backgroundColor: theme.markerMutedFill, borderColor: theme.accent, shadowColor: theme.shadowColor },
          ]}
        >
          <CameraGlyph size={14} color={theme.accent} />
        </View>
        <View style={[styles.pinStem, { backgroundColor: theme.accent }]} />
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
    gap: 16,
  },
  handle: { width: 40, height: 5, borderRadius: 3, alignSelf: "center" },
  label: { fontSize: 12, letterSpacing: 0.4 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    height: 36,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  typeChip: { flexDirection: "row", gap: 8, alignSelf: "flex-start", paddingLeft: 6 },
  glyph: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", gap: 10 },
  button: { flex: 1, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  // The pin's tip sits exactly on the screen centre (= map centre).
  pinWrap: { position: "absolute", left: "50%", top: "50%", width: 40, marginLeft: -20, marginTop: -54, alignItems: "center" },
  pin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pinStem: { width: 3, height: 14, borderRadius: 2 },
});
