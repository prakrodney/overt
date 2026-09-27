import { useEffect, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import type { RouteOption } from "../lib/directions";
import { arrivalTime, formatNavDistance, type NavUpdate } from "../lib/navEngine";
import type { Theme } from "../theme";
import { LocateIcon } from "./Icons";
import { Txt } from "./Txt";

type T = Theme & { isDark: boolean };

/** Turn arrow for a maneuver (drawn for right turns; left turns are mirrored). */
export function ManeuverIcon({ type, modifier, size = 44, color }: { type?: string; modifier?: string; size?: number; color: string }) {
  const m = modifier ?? "straight";
  const left = m.includes("left");
  const common = { stroke: color, strokeWidth: 2.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  let body;
  if (type === "arrive") {
    body = (
      <>
        <Path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z" {...common} />
        <Circle cx={12} cy={9.8} r={2.3} fill={color} />
      </>
    );
  } else if (m === "uturn") {
    body = (
      <>
        <Path d="M16 21V9.5a4 4 0 0 0-8 0V17" {...common} />
        <Path d="M4.5 13.5L8 17l3.5-3.5" {...common} />
      </>
    );
  } else if (m.includes("sharp")) {
    body = (
      <>
        <Path d="M8 3v8.5l8.5 8.5" {...common} />
        <Path d="M10.5 20.5h6.5V14" {...common} />
      </>
    );
  } else if (m.includes("slight")) {
    body = (
      <>
        <Path d="M9 21v-7.5l7.5-7.5" {...common} />
        <Path d="M11 5.5h6v6" {...common} />
      </>
    );
  } else if (m === "right" || m === "left") {
    body = (
      <>
        <Path d="M8 21v-8a5 5 0 0 1 5-5h6" {...common} />
        <Path d="M15.5 4.5L19 8l-3.5 3.5" {...common} />
      </>
    );
  } else {
    body = (
      <>
        <Path d="M12 21V4" {...common} />
        <Path d="M8 8l4-4 4 4" {...common} />
      </>
    );
  }
  return (
    <View style={{ transform: left && m !== "uturn" ? [{ scaleX: -1 }] : undefined }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {body}
      </Svg>
    </View>
  );
}

/** Big next-turn card at the top of the screen. */
export function NavBanner({ theme, update, rerouting }: { theme: T; update: NavUpdate | null; rerouting: boolean }) {
  const insets = useSafeAreaInsets();
  const b = update?.banner;
  return (
    <View style={[styles.banner, { top: insets.top + 8, backgroundColor: theme.accent }]}>
      {rerouting ? (
        <Txt weight="bold" style={{ color: theme.onAccent, fontSize: 22, paddingVertical: 10 }}>
          Rerouting…
        </Txt>
      ) : update?.arrived ? (
        <View style={styles.bannerRow}>
          <ManeuverIcon type="arrive" color={theme.onAccent} />
          <Txt weight="bold" style={{ color: theme.onAccent, fontSize: 24, flex: 1 }}>
            You've arrived
          </Txt>
        </View>
      ) : (
        <>
          <View style={styles.bannerRow}>
            <ManeuverIcon type={b?.type} modifier={b?.modifier} color={theme.onAccent} size={48} />
            <View style={{ flex: 1 }}>
              <Txt weight="extrabold" style={{ color: theme.onAccent, fontSize: 30, lineHeight: 34 }}>
                {update ? formatNavDistance(update.toManeuver) : "…"}
              </Txt>
              <Txt weight="semibold" numberOfLines={2} style={{ color: theme.onAccent, fontSize: 19, lineHeight: 23 }}>
                {b?.text || "Starting…"}
              </Txt>
            </View>
          </View>
          {b?.then ? (
            <Txt style={{ color: theme.onAccent, opacity: 0.85, fontSize: 14 }} numberOfLines={1}>
              Then {b.then}
            </Txt>
          ) : null}
        </>
      )}
    </View>
  );
}

export function SpeakerIcon({ muted, color }: { muted: boolean; color: string }) {
  const c = { stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" {...c} />
      {muted ? <Path d="M16 9.5l5 5M21 9.5l-5 5" {...c} /> : <Path d="M16 9a4.2 4.2 0 0 1 0 6M18.8 6.5a8 8 0 0 1 0 11" {...c} />}
    </Svg>
  );
}

/** Bottom bar while navigating: arrival time, time/distance left, mute, end. */
/**
 * Bottom panel while navigating. Collapsed: mute · arrival time · End.
 * Swipe up (or tap the time) to see every direction; swipe down to tuck it away.
 */
export function NavPanel({
  theme,
  update,
  route,
  muted,
  onToggleMute,
  onEnd,
  onLayoutHeight,
}: {
  theme: T;
  update: NavUpdate | null;
  route: RouteOption | null;
  muted: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
  /** Height of the collapsed bar, so buttons can sit above it. */
  onLayoutHeight: (h: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const fullH = Math.round(screenH * 0.66);
  const [barH, setBarH] = useState(0);
  const [open, setOpen] = useState(false);
  const closedY = Math.max(0, fullH - barH);
  const y = useRef(new Animated.Value(10000)).current;
  const startY = useRef(0);
  const currentY = useRef(10000);
  useEffect(() => {
    const id = y.addListener(({ value }) => (currentY.current = value));
    return () => y.removeListener(id);
  }, [y]);

  const snap = (toOpen: boolean) => {
    setOpen(toOpen);
    Animated.spring(y, { toValue: toOpen ? 0 : closedY, useNativeDriver: true, bounciness: 3, speed: 16 }).start();
  };
  // Keep the collapsed position right when sizes change.
  useEffect(() => {
    if (barH) y.setValue(open ? 0 : closedY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barH, closedY]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        y.stopAnimation();
        startY.current = currentY.current;
      },
      onPanResponderMove: (_, g) => {
        y.setValue(Math.min(closedYRef.current, Math.max(0, startY.current + g.dy)));
      },
      onPanResponderRelease: (_, g) => {
        const pos = startY.current + g.dy;
        const toOpen = g.vy < -0.3 ? true : g.vy > 0.3 ? false : pos < closedYRef.current / 2;
        snapRef.current(toOpen);
      },
    })
  ).current;
  const closedYRef = useRef(closedY);
  closedYRef.current = closedY;
  const snapRef = useRef(snap);
  snapRef.current = snap;

  const min = update ? Math.max(1, Math.round(update.remainingSec / 60)) : null;
  const mi = update ? update.remainingM / 1609.344 : null;
  return (
    <Animated.View
      style={[
        styles.panel,
        {
          height: fullH,
          backgroundColor: theme.surface,
          shadowColor: theme.shadowColor,
          shadowOpacity: theme.isDark ? 0.45 : 0.14,
          transform: [{ translateY: y }],
          opacity: barH ? 1 : 0,
        },
      ]}
    >
      {/* Drag area: handle + the bar */}
      <View
        {...pan.panHandlers}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setBarH(h);
          onLayoutHeight(h);
        }}
        style={{ paddingBottom: Math.max(insets.bottom, 12) + 6 }}
      >
        <View style={[styles.handle, { backgroundColor: theme.handle }]} />
        <View style={styles.barRow}>
          <Pressable
            onPress={onToggleMute}
            accessibilityRole="button"
            accessibilityLabel={muted ? "Unmute voice" : "Mute voice"}
            style={[styles.round, { backgroundColor: theme.subtle }]}
          >
            <SpeakerIcon muted={muted} color={theme.text} />
          </Pressable>
          <Pressable
            onPress={() => snap(!open)}
            accessibilityRole="button"
            accessibilityLabel={open ? "Hide directions" : "Show all directions"}
            style={({ pressed }) => ({ flex: 1, alignItems: "center", opacity: pressed ? 0.6 : 1 })}
          >
            <Txt weight="extrabold" style={{ fontSize: 24, color: theme.text }}>
              {update ? arrivalTime(update.remainingSec) : "--"}
            </Txt>
            <Txt style={{ fontSize: 14, color: theme.textSecondary }}>
              {min != null && mi != null
                ? `${min < 60 ? `${min} min` : `${Math.floor(min / 60)} hr ${min % 60} min`} · ${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`
                : "Getting your location…"}
            </Txt>
          </Pressable>
          <Pressable
            onPress={onEnd}
            accessibilityRole="button"
            style={({ pressed }) => [styles.end, { backgroundColor: theme.crashFill, opacity: pressed ? 0.85 : 1 }]}
          >
            <Txt weight="bold" style={{ color: "#FFFFFF", fontSize: 16 }}>
              End
            </Txt>
          </Pressable>
        </View>
      </View>
      <View style={{ flex: 1, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.divider }}>
        <StepsList theme={theme} route={route} update={update} bottomPad={insets.bottom + 16} />
      </View>
    </Animated.View>
  );
}

/** Shown when you've moved the map away while navigating. */
export function RecenterPill({ theme, bottom, onPress }: { theme: T; bottom: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.recenter,
        { bottom, backgroundColor: theme.control, opacity: pressed ? 0.8 : 1, shadowColor: theme.shadowColor },
      ]}
    >
      <LocateIcon size={18} color={theme.accentIcon} />
      <Txt weight="semibold" style={{ fontSize: 15, color: theme.text }}>
        Re-center
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 12,
    right: 12,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  bannerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    overflow: "visible",
  },
  handle: { width: 40, height: 5, borderRadius: 3, alignSelf: "center", marginTop: 8, marginBottom: 8 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18 },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  end: { height: 48, paddingHorizontal: 22, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  recenter: {
    position: "absolute",
    alignSelf: "center",
    left: "30%",
    right: "30%",
    height: 44,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
});

/** Every direction on the route, with the next turn highlighted and past turns faded. */
function StepsList({
  theme,
  route,
  update,
  bottomPad,
}: {
  theme: T;
  route: RouteOption | null;
  update: NavUpdate | null;
  bottomPad: number;
}) {
  const steps = route?.steps ?? [];
  const current = update?.stepIndex ?? 0;
  // Step k's maneuver is where step k starts; the next turn is the start of step current+1.
  const rows = steps.map((st, i) => ({ st, i })).filter(({ i }) => i > 0);
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottomPad }}>
      {rows.map(({ st, i }) => {
        const done = i <= current;
        const next = i === current + 1;
        let away: number | null = null;
        if (update && !done) {
          away = update.toManeuver;
          for (let j = current + 1; j < i; j++) away += steps[j].distanceM;
        }
        return (
          <View
            key={i}
            style={[
              stepStyles.row,
              { borderBottomColor: theme.divider, opacity: done ? 0.4 : 1 },
              next && { backgroundColor: theme.badgeBg },
            ]}
          >
            <View style={[stepStyles.icon, { backgroundColor: next ? theme.accent : theme.subtle }]}>
              <ManeuverIcon
                type={st.maneuver.type}
                modifier={st.maneuver.modifier}
                size={26}
                color={next ? theme.onAccent : theme.text}
              />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt weight={next ? "bold" : "semibold"} style={{ fontSize: 16, color: theme.text }}>
                {st.maneuver.instruction}
              </Txt>
              {st.distanceM > 0 && st.maneuver.type !== "arrive" ? (
                <Txt style={{ fontSize: 13, color: theme.textSecondary }}>
                  Then continue {formatNavDistance(st.distanceM)}
                </Txt>
              ) : null}
            </View>
            {away != null ? (
              <Txt weight="bold" style={{ fontSize: 14, color: next ? theme.accentIcon : theme.textSecondary }}>
                {formatNavDistance(away)}
              </Txt>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const stepStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
