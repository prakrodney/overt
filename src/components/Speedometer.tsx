import { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import * as Location from "expo-location";
import type { Theme } from "../theme";
import { Txt } from "./Txt";

type T = Theme & { isDark: boolean };

const MPS_TO_MPH = 2.23694;
const SHOW_AT_MPH = 5; // appears once you're clearly driving
const HIDE_AFTER_MS = 60_000; // stays up through red lights, hides after a minute stopped

/**
 * Current speed from the phone's GPS, in mph. Watches location only while the app
 * is open and location is allowed. Returns null until there's a usable reading.
 */
/** A GPS fix passed to listeners: position, heading (° from north, null if unknown) and speed in mph. */
export type Fix = { lat: number; lon: number; heading: number | null; mph: number | null };

export function useSpeed(enabled: boolean, onMove?: (fix: Fix) => void) {
  const [mph, setMph] = useState<number | null>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  useEffect(() => {
    if (!enabled) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    const start = async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted" || cancelled || sub) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (pos) => {
          const s = pos.coords.speed; // m/s; negative or null when unknown
          const v = s != null && s >= 0 ? s * MPS_TO_MPH : null;
          setMph(v);
          const h = pos.coords.heading;
          moveRef.current?.({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            heading: h != null && h >= 0 ? h : null,
            mph: v,
          });
        }
      );
      if (cancelled) {
        sub.remove();
        sub = null;
      }
    };
    const stop = () => {
      sub?.remove();
      sub = null;
      setMph(null);
    };

    start().catch(() => {});
    const appSub = AppState.addEventListener("change", (st) => {
      if (st === "active") start().catch(() => {});
      else stop();
    });
    return () => {
      cancelled = true;
      appSub.remove();
      stop();
    };
  }, [enabled]);

  return mph;
}

/** Round speed readout (top-left, opposite the locate button). Shows while driving; hides after a minute stopped. */
export function Speedometer({ theme, mph, top, bottom }: { theme: T; mph: number | null; top?: number; bottom?: number }) {
  const [visible, setVisible] = useState(false);
  const lastMoving = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (mph != null && mph >= SHOW_AT_MPH) {
      lastMoving.current = now;
      setVisible(true);
    } else if (visible && now - lastMoving.current > HIDE_AFTER_MS) {
      setVisible(false);
    }
  }, [mph, visible]);

  // Also hide if readings stop arriving while stopped.
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => {
      if (Date.now() - lastMoving.current > HIDE_AFTER_MS) setVisible(false);
    }, 5000);
    return () => clearInterval(t);
  }, [visible]);

  if (!visible) return null;
  const shown = mph == null ? "--" : String(Math.round(mph < 1 ? 0 : mph));
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={mph == null ? "Speed unavailable" : `${shown} miles per hour`}
      style={[
        styles.dial,
        {
          ...(bottom != null ? { bottom } : { top }),
          backgroundColor: theme.control,
          borderColor: theme.accentIcon,
          shadowColor: theme.shadowColor,
          shadowOpacity: theme.isDark ? 0.4 : 0.14,
        },
      ]}
    >
      <Txt weight="extrabold" style={{ fontSize: shown.length > 2 ? 24 : 28, lineHeight: 30, color: theme.text }}>
        {shown}
      </Txt>
      <Txt weight="semibold" style={{ fontSize: 11, letterSpacing: 0.4, color: theme.textSecondary }}>
        MPH
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  dial: {
    position: "absolute",
    left: 16,
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
});
