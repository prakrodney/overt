// Turn-by-turn guidance, computed on the phone from a Mapbox route.
// Feed it GPS fixes; it says where you are along the route, what the next maneuver
// is, what to say out loud, and whether you've left the route.

import type { Lane, NavStep, RouteOption } from "./directions";

type P = { lat: number; lon: number };

const OFF_ROUTE_M = 50; // this far from the line…
const OFF_ROUTE_FIXES = 4; // …for this many fixes in a row = off route
const HEADS_UP_M = 400; // warn about cameras / alerts this far ahead
const STALE_VOICE_M = 250; // skip announcements we're already well past

export type Hazard = { key: string; lat: number; lon: number; text: string };

export type NavUpdate = {
  stepIndex: number;
  /** Metres to the next maneuver */
  toManeuver: number;
  banner: { text: string; type?: string; modifier?: string; then?: string; lanes?: Lane[] };
  /** Posted speed limit where you are (mph), when known. */
  speedLimit: number | null;
  remainingM: number;
  remainingSec: number;
  offRoute: boolean;
  arrived: boolean;
  /** Lines to say out loud now, in order */
  speak: string[];
};

function metersPerDeg(lat: number) {
  return { x: Math.cos((lat * Math.PI) / 180) * 111320, y: 110540 };
}

function dist(a: P, b: P) {
  const k = metersPerDeg(a.lat);
  return Math.hypot((a.lon - b.lon) * k.x, (a.lat - b.lat) * k.y);
}

export class NavEngine {
  readonly route: RouteOption;
  private pts: P[];
  private cum: number[]; // metres along the line at each point
  private total: number;
  private steps: NavStep[];
  private stepStart: number[]; // metres along the line where each step starts
  private stepLen: number[];
  private spoken = new Set<string>();
  private hazards: { key: string; along: number; text: string }[] = [];
  private seg = 0;
  private offCount = 0;
  private progress = 0;
  private arrivedSaid = false;

  constructor(route: RouteOption) {
    this.route = route;
    this.pts = route.coords.map((c) => ({ lat: c.latitude, lon: c.longitude }));
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + dist(this.pts[i - 1], this.pts[i]));
    this.total = this.cum[this.cum.length - 1] || 1;
    this.steps = route.steps;
    // Step distances come from Mapbox; scale them to our measured line so they line up.
    const sum = this.steps.reduce((n, s) => n + s.distanceM, 0) || 1;
    const scale = this.total / sum;
    let acc = 0;
    this.stepStart = [];
    this.stepLen = [];
    for (const s of this.steps) {
      this.stepStart.push(acc);
      this.stepLen.push(s.distanceM * scale);
      acc += s.distanceM * scale;
    }
  }

  /** Project a point onto the route: metres along it, and metres off it. */
  private project(p: P, from = 0, to = this.pts.length - 1) {
    let best = { along: 0, off: Infinity, seg: 0 };
    const k = metersPerDeg(p.lat);
    for (let i = Math.max(1, from); i <= Math.min(to, this.pts.length - 1); i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      const ax = (a.lon - p.lon) * k.x, ay = (a.lat - p.lat) * k.y;
      const bx = (b.lon - p.lon) * k.x, by = (b.lat - p.lat) * k.y;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      const off = Math.hypot(ax + t * dx, ay + t * dy);
      if (off < best.off) best = { along: this.cum[i - 1] + t * Math.sqrt(len2), off, seg: i };
    }
    return best;
  }

  /** Cameras / road alerts to announce when they're coming up on this route. */
  setHazards(list: Hazard[]) {
    const out: { key: string; along: number; text: string }[] = [];
    for (const h of list) {
      const pr = this.project({ lat: h.lat, lon: h.lon });
      if (pr.off <= 40) out.push({ key: h.key, along: pr.along, text: h.text });
    }
    this.hazards = out;
  }

  update(fix: P): NavUpdate {
    // Search near where we were first (fast, and avoids jumping to a parallel stretch).
    let pr = this.project(fix, this.seg - 5, this.seg + 120);
    if (pr.off > 80) pr = this.project(fix);
    this.seg = pr.seg;
    this.offCount = pr.off > OFF_ROUTE_M ? this.offCount + 1 : 0;
    this.progress = pr.along;

    let k = 0;
    while (k + 1 < this.steps.length && this.stepStart[k + 1] <= this.progress + 0.5) k++;
    const step = this.steps[k];
    const toManeuver = Math.max(0, this.stepStart[k] + this.stepLen[k] - this.progress);

    // Banner: the latest one whose trigger point we've passed.
    const banners = [...(step?.banner ?? [])].sort((a, b) => b.before - a.before);
    let banner = banners[0] ?? { text: step?.maneuver.instruction ?? "", before: 0 };
    for (const b of banners) if (toManeuver <= b.before + 1) banner = b;

    const speak: string[] = [];
    // Voice: the most recent announcement we've reached (older ones are skipped).
    let due: { key: string; text: string } | null = null;
    (step?.voice ?? []).forEach((v, i) => {
      const key = `v${k}:${i}`;
      if (this.spoken.has(key)) return;
      if (toManeuver <= v.before + 1) {
        this.spoken.add(key);
        if (v.before - toManeuver < STALE_VOICE_M) due = { key, text: v.text };
      }
    });
    if (due) speak.push((due as { text: string }).text);

    // Heads-up for cameras and road alerts ahead.
    for (const h of this.hazards) {
      const ahead = h.along - this.progress;
      if (ahead > 0 && ahead <= HEADS_UP_M && !this.spoken.has(h.key)) {
        this.spoken.add(h.key);
        speak.push(h.text);
      }
    }

    const remainingM = Math.max(0, this.total - this.progress);
    const arrived = remainingM < 25;
    if (arrived && !this.arrivedSaid) {
      this.arrivedSaid = true;
      if (!speak.length) speak.push("You have arrived.");
    }
    return {
      stepIndex: k,
      toManeuver,
      banner: {
        text: banner.text,
        type: banner.type,
        modifier: banner.modifier,
        then: banner.then,
        // Lanes only matter as you get close to the turn.
        lanes: toManeuver < 800 ? (banner as { lanes?: Lane[] }).lanes : undefined,
      },
      speedLimit: this.route.maxspeedMph?.[Math.max(0, this.seg - 1)] ?? null,
      remainingM,
      remainingSec: this.route.durationSec * (remainingM / this.total),
      offRoute: this.offCount >= OFF_ROUTE_FIXES,
      arrived,
      speak,
    };
  }
}

/** "500 ft", "0.3 mi", "12 mi" */
export function formatNavDistance(m: number) {
  const mi = m / 1609.344;
  if (mi < 0.1) return `${Math.max(50, Math.round((m * 3.28084) / 50) * 50)} ft`;
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

export function arrivalTime(sec: number) {
  const d = new Date(Date.now() + sec * 1000);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export { dist as metersBetween };
