import { useEffect, useRef, useState } from "react";
import { ActionSheetIOS, ActivityIndicator, Animated, Linking, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isRedLight, isSpeedCamera, type CameraPoint } from "../lib/cameras";
import { describeLocation } from "../lib/geocode";
import { formatFacing, formatUpdated } from "../lib/geo";
import { reportIssue, voteOnPoint } from "../lib/reports";
import type { Theme } from "../theme";
import { CheckIcon, CloseIcon, InfoIcon } from "./Icons";
import { Txt } from "./Txt";

type T = Theme & { isDark: boolean };

const BADGE: Record<CameraPoint["confidence_level"], string> = {
  verified: "Verified",
  community: "Community reported",
  needs_confirmation: "Needs confirmation",
};

function sourceLabel(p: CameraPoint) {
  if (p.source === "osm") return "OpenStreetMap";
  if (p.source === "community") return "DeCam GPS community";
  return p.source;
}

function speedLimit(raw: string | null | undefined) {
  if (!raw) return null;
  const t = raw.trim();
  return /^\d+$/.test(t) ? `${t} mph` : t;
}

function cameraType(p: CameraPoint) {
  if (isSpeedCamera(p)) return "Speed camera";
  if (isRedLight(p)) return "Red-light camera";
  const maker = p.manufacturer && !/^unknown$/i.test(p.manufacturer) ? p.manufacturer : null;
  return maker ? `${maker} ALPR camera` : "ALPR camera";
}

function Row({ label, value, theme, last }: { label: string; value: string; theme: T; last?: boolean }) {
  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: theme.divider, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth * 2 },
      ]}
    >
      <Txt style={[styles.rowLabel, { color: theme.textSecondary }]}>{label}</Txt>
      <Txt weight="semibold" style={[styles.rowValue, { color: theme.text }]}>
        {value}
      </Txt>
    </View>
  );
}

/** Bottom sheet for a tapped camera. Swipe down or tap × to close. */
export function CameraSheet({
  point,
  theme,
  onClose,
  onChanged,
}: {
  point: CameraPoint | null;
  theme: T;
  onClose: () => void;
  /** Called after a vote changes the camera, so the map can reload. */
  onChanged?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;
  const [shown, setShown] = useState<CameraPoint | null>(point);
  const [place, setPlace] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "confirm" | "issue">(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Slide in / out, keeping the last point rendered while it animates away.
  useEffect(() => {
    if (point) {
      setShown(point);
      setMessage(null);
      setBusy(null);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
    } else {
      Animated.timing(translateY, { toValue: 600, duration: 200, useNativeDriver: true }).start(() =>
        setShown(null)
      );
    }
  }, [point, translateY]);

  // Approximate location: reverse-geocode to the nearest street.
  useEffect(() => {
    let live = true;
    setPlace(null);
    if (point) describeLocation(point.lat, point.lon).then((s) => live && setPlace(s));
    return () => {
      live = false;
    };
  }, [point]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => translateY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 || g.vy > 0.8) onCloseRef.current();
        else Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  if (!shown) return null;
  const p = shown;

  const vote = async (verdict: "confirm" | "gone") => {
    setBusy(verdict === "confirm" ? "confirm" : "issue");
    setMessage(null);
    try {
      const r = await voteOnPoint(p.id, verdict);
      setShown({ ...p, confidence_level: r.confidence_level as CameraPoint["confidence_level"], confirm_count: r.confirm_count,
                 last_verified_at: verdict === "confirm" ? new Date().toISOString() : p.last_verified_at });
      setMessage({
        ok: true,
        text:
          r.status === "archived"
            ? "Thanks. Enough people said it's gone, so it's been taken off the map."
            : verdict === "confirm"
              ? "Thanks for confirming. That keeps the map accurate for everyone."
              : "Thanks. If others agree it's gone, it will come off the map.",
      });
      onChanged?.();
    } catch (e: any) {
      setMessage({ ok: false, text: e?.message ?? "Something went wrong. Try again." });
    } finally {
      setBusy(null);
    }
  };

  const flag = async (kind: "wrong_location" | "details_wrong" | "not_enforcement") => {
    setBusy("issue");
    setMessage(null);
    try {
      await reportIssue(p.id, kind);
      setMessage({ ok: true, text: "Thanks. We'll review it." });
    } catch (e: any) {
      setMessage({ ok: false, text: e?.message ?? "Something went wrong. Try again." });
    } finally {
      setBusy(null);
    }
  };

  // Speed / red-light cameras get an extra choice: OpenStreetMap often lists the cameras that
  // only tell a traffic light a car is waiting as enforcement cameras.
  const enforcementKind = p.category === "speed_camera" ? "speed camera" : p.category === "red_light" ? "red-light camera" : null;
  const openIssueMenu = () => {
    const options = ["It's gone", "It's in the wrong spot", "The details are wrong"];
    if (enforcementKind) options.push(`It's not a ${enforcementKind}`);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "What's wrong?",
        options: [...options, "Cancel"],
        destructiveButtonIndex: 0,
        cancelButtonIndex: options.length,
        userInterfaceStyle: theme.isDark ? "dark" : "light",
      },
      (i) => {
        if (i === 0) vote("gone");
        else if (i === 1) flag("wrong_location");
        else if (i === 2) flag("details_wrong");
        else if (i === 3 && enforcementKind) flag("not_enforcement");
      }
    );
  };
  const coords = `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`;
  const osmUrl = p.osm_type && p.osm_id ? `https://www.openstreetmap.org/${p.osm_type}/${p.osm_id}` : null;
  const verified = p.confidence_level === "verified";

  return (
    <Animated.View
      {...pan.panHandlers}
      style={[
        styles.sheet,
        {
          backgroundColor: theme.surface,
          paddingBottom: Math.max(insets.bottom, 16) + 8,
          shadowColor: theme.shadowColor,
          shadowOpacity: theme.isDark ? 0.45 : 0.12,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={[styles.handle, { backgroundColor: theme.handle }]} />

      <View style={styles.header}>
        <View style={{ flex: 1, gap: 8 }}>
          <Txt weight="semibold" style={[styles.overline, { color: theme.textSecondary }]}>
            {isRedLight(p) ? "ENFORCEMENT · RED LIGHT" : isSpeedCamera(p) ? "ENFORCEMENT · SPEED" : "SURVEILLANCE · ALPR"}
          </Txt>
          <Txt weight="bold" style={[styles.title, { color: theme.text }]}>
            {isRedLight(p) ? "Red-light camera" : isSpeedCamera(p) ? "Speed camera" : "Automated license plate reader"}
          </Txt>
          <View style={[styles.badge, { backgroundColor: theme.badgeBg }]}>
            {verified ? <CheckIcon color={theme.badgeText} /> : <InfoIcon color={theme.badgeText} />}
            <Txt weight="bold" style={{ color: theme.badgeText, fontSize: 13 }}>
              {BADGE[p.confidence_level]}
            </Txt>
          </View>
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

      <View style={[styles.rows, { borderTopColor: theme.divider }]}>
        <Row label="Type" value={cameraType(p)} theme={theme} />
        <Row label="Location" value={`${place ?? coords} (approx.)`} theme={theme} />
        <Row label="Facing" value={formatFacing(p.directions)} theme={theme} />
        {speedLimit(p.maxspeed) ? <Row label="Speed limit" value={speedLimit(p.maxspeed)!} theme={theme} /> : null}
        {p.operator ? <Row label="Operator" value={p.operator} theme={theme} /> : null}
        {p.last_verified_at ? (
          <Row label="Last verified" value={formatUpdated(p.last_verified_at)} theme={theme} />
        ) : (
          <Row label="Last updated" value={formatUpdated(p.updated_at)} theme={theme} />
        )}
        <Row label="Source" value={sourceLabel(p)} theme={theme} />
        <Row
          label="Confirmations"
          value={p.confirm_count ? (p.confirm_count === 1 ? "1 person" : `${p.confirm_count} people`) : "None yet"}
          theme={theme}
          last
        />
      </View>

      {message ? (
        <Txt style={{ fontSize: 14, color: message.ok ? theme.goodText : theme.badText }}>{message.text}</Txt>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={() => vote("confirm")}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityHint="Confirms this camera is still here. You need to be within 300 metres."
          style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.accent, opacity: pressed || busy ? 0.8 : 1 }]}
        >
          {busy === "confirm" ? (
            <ActivityIndicator color={theme.onAccent} />
          ) : (
            <Txt weight="bold" style={{ color: theme.onAccent, fontSize: 16 }}>
              Still there
            </Txt>
          )}
        </Pressable>
        <Pressable
          onPress={openIssueMenu}
          disabled={busy !== null}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.secondaryButton,
            { borderColor: theme.outline, backgroundColor: theme.surface, opacity: pressed || busy ? 0.7 : 1 },
          ]}
        >
          {busy === "issue" ? (
            <ActivityIndicator color={theme.text} />
          ) : (
            <Txt weight="semibold" style={{ color: theme.text, fontSize: 16 }}>
              Report an issue
            </Txt>
          )}
        </Pressable>
      </View>

      {osmUrl ? (
        <Pressable onPress={() => Linking.openURL(osmUrl)} accessibilityRole="link" hitSlop={8} style={{ alignSelf: "center" }}>
          <Txt weight="medium" style={{ color: theme.textSecondary, fontSize: 13, textDecorationLine: "underline" }}>
            View on OpenStreetMap
          </Txt>
        </Pressable>
      ) : null}
    </Animated.View>
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
    gap: 18,
  },
  handle: { width: 40, height: 5, borderRadius: 3, alignSelf: "center" },
  header: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  overline: { fontSize: 13, letterSpacing: 0.4 },
  title: { fontSize: 22, lineHeight: 26, letterSpacing: -0.3 },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: 999,
  },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  rows: { borderTopWidth: StyleSheet.hairlineWidth * 2 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 16, paddingVertical: 13 },
  rowLabel: { fontSize: 15 },
  rowValue: { fontSize: 15, flexShrink: 1, textAlign: "right" },
  actions: { flexDirection: "row", gap: 10 },
  primaryButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
