// DeCam GPS Pro: police / crash / object alerts, voice guidance, speed cameras.
// Free: the plate-reader (Flock) map, routes, detours and everything else.
//
// For now (Expo Go) Pro comes from a 3-day free trial stored on this phone, or from
// being an admin. Real $9.99/month subscriptions need the App Store build
// (StoreKit / RevenueCat); `purchased` will be filled in then.

import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";

export const PRO_PRICE = "$9.99/month";
export const TRIAL_DAYS = 3;
const TRIAL_KEY = "overt.trialStartedAt.v1";

type State = {
  trialStartedAt: number | null;
  isAdmin: boolean;
  purchased: boolean;
  loaded: boolean;
  previewFree: boolean;
  /** Free Pro time earned from invites (checked on the server). */
  giftUntil: number;
};
let state: State = { trialStartedAt: null, isAdmin: false, purchased: false, loaded: false, previewFree: false, giftUntil: 0 };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

SecureStore.getItemAsync(TRIAL_KEY)
  .then((v) => set({ trialStartedAt: v ? Number(v) || null : null, loaded: true }))
  .catch(() => set({ loaded: true }));

// Re-check the trial clock every minute so Pro turns off on time.
setInterval(() => listeners.forEach((l) => l()), 60_000);

export function setAdminPro(isAdmin: boolean) {
  if (state.isAdmin !== isAdmin) set({ isAdmin });
}

/** Admins can look at the app the way a free user sees it (not saved; resets on restart). */
export function setPreviewFree(on: boolean) {
  set({ previewFree: on });
}
export const isPreviewingFree = () => state.previewFree;

/** Free Pro weeks from inviting friends (or using a friend's code). */
export function setGiftUntil(ms: number) {
  if (ms !== state.giftUntil) set({ giftUntil: ms });
}

export function startTrial() {
  if (state.trialStartedAt) return;
  const now = Date.now();
  set({ trialStartedAt: now });
  SecureStore.setItemAsync(TRIAL_KEY, String(now)).catch(() => {});
}

export type ProStatus = {
  isPro: boolean;
  /** "free" | "trial" | "trial_ended" | "pro" | "admin" | "gift" (invite weeks) */
  kind: "free" | "trial" | "trial_ended" | "pro" | "admin" | "gift";
  trialMsLeft: number;
  loaded: boolean;
};

function compute(): ProStatus {
  const trialEnd = state.trialStartedAt ? state.trialStartedAt + TRIAL_DAYS * 86_400_000 : 0;
  const left = Math.max(0, trialEnd - Date.now());
  if (state.purchased) return { isPro: true, kind: "pro", trialMsLeft: 0, loaded: state.loaded };
  if (state.isAdmin && !state.previewFree) return { isPro: true, kind: "admin", trialMsLeft: 0, loaded: state.loaded };
  if (state.isAdmin && state.previewFree) return { isPro: false, kind: "free", trialMsLeft: 0, loaded: state.loaded };
  const gift = Math.max(0, state.giftUntil - Date.now());
  if (gift > 0 && gift >= left) return { isPro: true, kind: "gift", trialMsLeft: gift, loaded: state.loaded };
  if (state.trialStartedAt && left > 0) return { isPro: true, kind: "trial", trialMsLeft: left, loaded: state.loaded };
  if (state.trialStartedAt) return { isPro: false, kind: "trial_ended", trialMsLeft: 0, loaded: state.loaded };
  return { isPro: false, kind: "free", trialMsLeft: 0, loaded: state.loaded };
}

let cached = compute();
let cachedKey = "";
export function usePro(): ProStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => {
      const next = compute();
      const key = `${state.previewFree}|${state.isAdmin}|${next.kind}|${Math.ceil(next.trialMsLeft / 3_600_000)}|${next.loaded}`;
      if (key !== cachedKey) {
        cachedKey = key;
        cached = next;
      }
      return cached;
    }
  );
}

export function trialLeftText(ms: number) {
  const h = Math.ceil(ms / 3_600_000);
  if (h > 24) return `${Math.ceil(h / 24)} days left`;
  return h <= 1 ? "less than an hour left" : `${h} hours left`;
}
