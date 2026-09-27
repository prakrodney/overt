// Spoken guidance using the iPhone's own voices (expo-speech). Picks the best
// US-English voice installed: "Premium" or "Enhanced" voices sound far more natural
// and can be downloaded free in Settings › Accessibility › Spoken Content › Voices.

import * as SecureStore from "expo-secure-store";
import * as Speech from "expo-speech";

let voiceId: string | undefined;
let picked = false;
let muted = false;
const MUTE_KEY = "overt.navMuted.v1";

async function pickVoice() {
  if (picked) return;
  picked = true;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const en = voices.filter((v) => v.language?.toLowerCase().startsWith("en-us"));
    const rank = (v: Speech.Voice) =>
      /premium/i.test(`${v.quality} ${v.identifier}`) ? 3 : v.quality === Speech.VoiceQuality.Enhanced ? 2 : 1;
    en.sort((a, b) => rank(b) - rank(a));
    voiceId = en[0]?.identifier;
  } catch {
    voiceId = undefined;
  }
}

export async function loadMuted() {
  try {
    muted = (await SecureStore.getItemAsync(MUTE_KEY)) === "1";
  } catch {
    muted = false;
  }
  pickVoice();
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  if (m) Speech.stop();
  SecureStore.setItemAsync(MUTE_KEY, m ? "1" : "0").catch(() => {});
}

export function say(text: string) {
  if (muted || !text) return;
  pickVoice().finally(() => {
    Speech.speak(text, { language: "en-US", voice: voiceId, rate: 1.0, pitch: 1.0 });
  });
}

export function stopSpeaking() {
  Speech.stop();
}
