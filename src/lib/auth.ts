// Anonymous accounts: each phone gets a Supabase user with no email or sign-up.
// The session is kept in the iOS Keychain (expo-secure-store) and refreshed
// automatically. Later, Sign in with Apple can upgrade this same account.

import * as SecureStore from "expo-secure-store";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config";

type Session = { access_token: string; refresh_token: string; expires_at: number; user_id: string };

const KEY = "overt.session.v1";
let cached: Session | null = null;
let inflight: Promise<Session> | null = null;

async function authCall(path: string, body: object): Promise<Session> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    if (json.error_code === "anonymous_provider_disabled") {
      throw new Error("Reporting isn't switched on yet (anonymous sign-ins are off in Supabase).");
    }
    throw new Error(json.msg || json.error_description || "Couldn't connect your device. Try again.");
  }
  const s: Session = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at ?? Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600),
    user_id: json.user?.id,
  };
  cached = s;
  await SecureStore.setItemAsync(KEY, JSON.stringify(s)).catch(() => {});
  return s;
}

async function loadSession(): Promise<Session> {
  if (!cached) {
    const raw = await SecureStore.getItemAsync(KEY).catch(() => null);
    if (raw) cached = JSON.parse(raw);
  }
  if (cached && cached.expires_at - 60 > Date.now() / 1000) return cached;
  if (cached?.refresh_token) {
    try {
      return await authCall("token?grant_type=refresh_token", { refresh_token: cached.refresh_token });
    } catch {
      // fall through to a fresh anonymous account
    }
  }
  return authCall("signup", {});
}

/** True if this phone already has an account (so checking admin status won't create one). */
export async function hasSession(): Promise<boolean> {
  if (cached) return true;
  const raw = await SecureStore.getItemAsync(KEY).catch(() => null);
  return !!raw;
}

/** A valid access token for this device's anonymous account. */
export async function getAccessToken(): Promise<string> {
  inflight ??= loadSession().finally(() => {
    inflight = null;
  });
  return (await inflight).access_token;
}

/** Call a signed-in Postgres function. Throws with the server's message on failure. */
export async function rpcAuthed<T = any>(fn: string, args: object): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message || `Request failed (${res.status})`);
  return json as T;
}
