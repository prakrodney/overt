// Small app preferences kept on this phone.

import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";

export type MapStyle = "mutedStandard" | "standard" | "satellite" | "hybrid";
export type Prefs = {
  driveAlerts: boolean;
  mapStyle: MapStyle;
  /** Ask "Still there?" after you drive past a police, crash or object report. */
  askStillHere: boolean;
  /** Pro: say something when you're over the speed limit. */
  speedWarn: boolean;
};

const KEY = "overt.prefs.v1";
let prefs: Prefs = { driveAlerts: true, mapStyle: "mutedStandard", askStillHere: true, speedWarn: true };
const listeners = new Set<() => void>();

SecureStore.getItemAsync(KEY)
  .then((raw) => {
    if (raw) {
      prefs = { ...prefs, ...JSON.parse(raw) };
      listeners.forEach((l) => l());
    }
  })
  .catch(() => {});

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  prefs = { ...prefs, [key]: value };
  listeners.forEach((l) => l());
  SecureStore.setItemAsync(KEY, JSON.stringify(prefs)).catch(() => {});
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs
  );
}
