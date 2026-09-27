import { memo, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ALERT_LABEL,
  minutesAgo,
  minutesLeft,
  voteRoadAlert,
  type RoadAlert,
  type RoadAlertType,
} from "../lib/roadAlerts";
import type { Theme } from "../theme";
import { CloseIcon, CrashIcon, HazardIcon, PoliceIcon } from "./Icons";
import { Txt } from "./Txt";

type T = Theme & { isDark: boolean };

export function alertColors(type: RoadAlertType, theme: T) {
  if (type === "police") return { bg: theme.policeFill, fg: theme.alertGlyph };
  if (type === "crash") return { bg: theme.crashFill, fg: theme.alertGlyph };
  return { bg: theme.hazardFill, fg: theme.hazardGlyph };
}

export function AlertGlyph({ type, size, color }: { type: RoadAlertType; size: number; color: string }) {
  if (type === "police") return <PoliceIcon size={size} color={color} />;
  if (type === "crash") return <CrashIcon size={size} color={color} />;
  return <HazardIcon size={size} color={color} />;
}

/** Rounded-square "sign" pin, so live alerts never look like the round camera markers. */
export const RoadAlertMarker = memo(function RoadAlertMarker({
  alert,
  selected,
  theme,
  onPress,
}: {
  alert: RoadAlert;
  selected: boolean;
  theme: T;
  onPress: (a: RoadAlert) => void;
}) {
  const { bg, fg } = alertColors(alert.type, theme);
  const s = selected ? 38 : 30;
  return (
    <Marker
      key={`ra-${alert.id}-${selected ? "s" : "n"}-${theme.isDark ? "d" : "l"}`}
      coordinate={{ latitude: alert.lat, longitude: alert.lon }}
      anchor={{ x: 0.5, y: 1 }}
      onPress={(e) => {
        e.stopPropagation();
        onPress(alert);
      }}
      tracksViewChanges={false}
      zIndex={selected ? 1100 : 800}
      accessibilityLabel={`${ALERT_LABEL[alert.type]} reported ${minutesAgo(alert.created_at)}`}
    >
      <View style={{ alignItems: "center" }}>
        <View
          style={{
            width: s,
            height: s,
            borderRadius: 9,
            backgroundColor: bg,
            borderWidth: 2,
            borderColor: theme.alertStroke,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: theme.shadowColor,
            shadowOpacity: 0.3,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
          }}
        >
          <AlertGlyph type={alert.type} size={selected ? 22 : 17} color={fg} />
        </View>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: 5,
            borderRightWidth: 5,
            borderTopWidth: 7,
            borderLeftColor: "transparent",
            borderRightColor: "transparent",
            borderTopColor: theme.alertStroke,
            marginTop: -1,
          }}
        />
      </View>
    </Marker>
  );
});

const TITLE: Record<RoadAlertType, string> = {
  police: "Police reported",
  crash: "Crash reported",
  hazard: "Object on road",
};

/** Bottom sheet for a tapped alert: how old, confirmations, Still there / Not there. */
export function RoadAlertSheet({
  alert,
  theme,
  onClose,
  onChanged,
  onMessage,
}: {
  alert: RoadAlert;
  theme: T;
  onClose: () => void;
  onChanged: () => void;
  onMessage: (text: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<null | "still_there" | "gone">(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000); // keep "x min ago" fresh
    return () => clearInterval(t);
  }, []);

  const { bg, fg } = alertColors(alert.type, theme);
  const left = minutesLeft(alert.expires_at);
  const meta = [
    `Reported ${minutesAgo(alert.created_at)}`,
    alert.confirm_count
      ? `confirmed by ${alert.confirm_count} ${alert.confirm_count === 1 ? "driver" : "drivers"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const vote = async (v: "still_there" | "gone") => {
    setBusy(v);
    try {
      const r = await voteRoadAlert(alert.id, v);
      if (r.removed) onMessage(alert.mine ? "Your report was removed." : "Thanks! It's been taken off the map.");
      else if (v === "still_there") onMessage("Thanks! It'll stay on the map for another hour.");
      else onMessage("Thanks! If others agree, it'll be taken off the map.");
      onChanged();
      onClose();
    } catch (e: any) {
      onMessage(e?.message ?? "Couldn't send that. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const button = (label: string, v: "still_there" | "gone", primary: boolean) => (
    <Pressable
      key={v}
      onPress={() => vote(v)}
      disabled={busy != null}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: theme.accent }
          : { borderWidth: 1.5, borderColor: theme.outline, backgroundColor: theme.surface },
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {busy === v ? (
        <ActivityIndicator color={primary ? theme.onAccent : theme.text} />
      ) : (
        <Txt weight="bold" style={{ fontSize: 16, color: primary ? theme.onAccent : theme.text }}>
          {label}
        </Txt>
      )}
    </Pressable>
  );

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
        <View style={[styles.icon, { backgroundColor: bg }]}>
          <AlertGlyph type={alert.type} size={24} color={fg} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Txt weight="bold" style={{ fontSize: 21, color: theme.text }}>
            {TITLE[alert.type]}
          </Txt>
          <Txt style={{ fontSize: 14, color: theme.textSecondary }}>{meta}</Txt>
          <Txt style={{ fontSize: 14, color: theme.textSecondary }}>
            {left <= 1 ? "Disappears in a minute" : `Disappears in ${left} min unless someone confirms it`}
          </Txt>
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
      <View style={{ flexDirection: "row", gap: 10 }}>
        {alert.mine
          ? button("Remove my report", "gone", false)
          : [button("Not there", "gone", false), button("Still there", "still_there", true)]}
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
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  button: { flex: 1, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
