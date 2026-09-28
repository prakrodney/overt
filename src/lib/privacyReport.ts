// "Your privacy report": plate readers you passed and avoided, kept only on this phone.

import * as SecureStore from "expo-secure-store";

const KEY = "overt.privacy.v1";
type Day = [string, number, number, number]; // [YYYY-MM-DD, passed, avoided, trips]
let days: Day[] | null = null;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function load(): Promise<Day[]> {
  if (days) return days;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    days = raw ? (JSON.parse(raw) as Day[]) : [];
  } catch {
    days = [];
  }
  return days;
}

async function bump(passed: number, avoided: number, trips: number) {
  const list = await load();
  const t = today();
  let row = list.find((d) => d[0] === t);
  if (!row) {
    row = [t, 0, 0, 0];
    list.push(row);
  }
  row[1] += passed;
  row[2] += avoided;
  row[3] += trips;
  days = list.slice(-60); // keep about two months
  SecureStore.setItemAsync(KEY, JSON.stringify(days)).catch(() => {});
}

/** A navigation started: `passed` plate readers on the chosen route, `avoided` vs the fastest route. */
export const recordTrip = (passed: number, avoided: number) => bump(passed, Math.max(0, avoided), 1);
/** Drive mode: you drove past a plate reader. */
export const recordPassed = (n = 1) => bump(n, 0, 0);

export type Week = { label: string; passed: number; avoided: number; trips: number };

export async function weeklySummary(weeks = 4): Promise<Week[]> {
  const list = await load();
  const out: Week[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let w = 0; w < weeks; w++) {
    const end = new Date(now.getTime() - w * 7 * 86_400_000);
    const start = new Date(end.getTime() - 6 * 86_400_000);
    const inRange = list.filter(([d]) => {
      const t = new Date(`${d}T00:00:00`).getTime();
      return t >= start.getTime() && t <= end.getTime();
    });
    out.push({
      label: w === 0 ? "This week" : w === 1 ? "Last week" : `${w} weeks ago`,
      passed: inRange.reduce((n, d) => n + d[1], 0),
      avoided: inRange.reduce((n, d) => n + d[2], 0),
      trips: inRange.reduce((n, d) => n + d[3], 0),
    });
  }
  return out;
}

export async function clearPrivacyReport() {
  days = [];
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
}
