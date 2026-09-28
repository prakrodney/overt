import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listPendingReports, moderateReport, type ModerateAction, type PendingReport } from "../lib/admin";
import { formatFacing, formatUpdated } from "../lib/geo";
import { describeLocation } from "../lib/geocode";
import { listDisputed, resolveDisputed, type Disputed } from "../lib/community";
import type { Theme } from "../theme";
import { CloseIcon, PinIcon } from "./Icons";
import { Txt } from "./Txt";

type T = Theme & { isDark: boolean };

const TITLE: Record<string, string> = {
  new: "New camera reported",
  wrong_location: "Wrong location",
  details_wrong: "Details are wrong",
  not_enforcement: "Not really a speed / red-light camera",
  other: "Other issue",
};

function cameraLine(r: PendingReport) {
  const p = r.point;
  if (!p) return "The camera is no longer in the database.";
  const src = p.source === "osm" ? "OpenStreetMap camera" : "Community camera";
  const parts = [src];
  if (p.confirm_count) parts.push(`${p.confirm_count} "still there"`);
  if (p.gone_count) parts.push(`${p.gone_count} "gone"`);
  if (p.status !== "active") parts.push("already removed");
  return parts.join(" · ");
}

function ReportCard({
  r,
  theme,
  busy,
  onAct,
  onShow,
}: {
  r: PendingReport;
  theme: T;
  busy: boolean;
  onAct: (r: PendingReport, a: ModerateAction) => void;
  onShow: (r: PendingReport) => void;
}) {
  const [place, setPlace] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    describeLocation(r.lat, r.lon).then((s) => live && setPlace(s));
    return () => {
      live = false;
    };
  }, [r.lat, r.lon]);

  const isNew = r.type === "new";
  const facing = r.point?.directions_deg?.length
    ? formatFacing(r.point.directions_deg)
    : r.direction_deg != null
      ? formatFacing([r.direction_deg])
      : "Not given";

  const btn = (label: string, action: ModerateAction, kind: "primary" | "danger" | "plain") => (
    <Pressable
      key={action}
      disabled={busy}
      onPress={() => onAct(r, action)}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.btn,
        kind === "primary"
          ? { backgroundColor: theme.accent }
          : kind === "danger"
            ? { backgroundColor: theme.badBg }
            : { backgroundColor: theme.subtle },
        { opacity: busy ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      <Txt
        weight="bold"
        style={{
          fontSize: 15,
          color: kind === "primary" ? theme.onAccent : kind === "danger" ? theme.badText : theme.text,
        }}
      >
        {label}
      </Txt>
    </Pressable>
  );

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Txt weight="bold" style={{ fontSize: 17, color: theme.text }}>
            {TITLE[r.type] ?? r.type}
          </Txt>
          <Txt style={{ fontSize: 13, color: theme.textSecondary }}>{formatUpdated(r.created_at)}</Txt>
        </View>
        <Pressable
          onPress={() => onShow(r)}
          accessibilityRole="button"
          accessibilityLabel="Show on map"
          style={({ pressed }) => [styles.show, { backgroundColor: theme.subtle, opacity: pressed ? 0.7 : 1 }]}
        >
          <PinIcon size={16} color={theme.accentIcon} />
          <Txt weight="semibold" style={{ fontSize: 13, color: theme.text }}>
            Map
          </Txt>
        </Pressable>
      </View>

      {r.note ? (
        <Txt style={{ fontSize: 15, lineHeight: 21, color: theme.text }}>"{r.note}"</Txt>
      ) : null}

      <View style={{ gap: 2 }}>
        <Txt style={{ fontSize: 14, color: theme.textSecondary }}>{place ?? `${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`}</Txt>
        <Txt style={{ fontSize: 14, color: theme.textSecondary }}>{cameraLine(r)}</Txt>
        <Txt style={{ fontSize: 14, color: theme.textSecondary }}>Facing: {facing}</Txt>
        <Txt style={{ fontSize: 14, color: theme.textSecondary }}>
          Reporter: trust {r.reporter_trust ?? "?"}/100 · {r.reporter_reports}{" "}
          {r.reporter_reports === 1 ? "report" : "reports"}
        </Txt>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        {isNew
          ? [btn("Reject", "reject", "danger"), btn("Approve", "approve", "primary")]
          : r.point && r.point.status === "active"
            ? [btn("Keep camera", "keep_camera", "plain"), btn("Remove camera", "remove_camera", "danger")]
            : [btn("Dismiss", "keep_camera", "plain")]}
      </View>
    </View>
  );
}

const KIND: Record<string, string> = { alpr: "Plate reader", speed_camera: "Speed camera", red_light: "Red-light camera" };

/** A camera that drivers said is gone ("Still here?" answers). */
function DisputedCard({
  d,
  theme,
  busy,
  onAct,
  onShow,
}: {
  d: Disputed;
  theme: T;
  busy: boolean;
  onAct: (d: Disputed, a: "keep" | "remove") => void;
  onShow: (d: Disputed) => void;
}) {
  const [place, setPlace] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    describeLocation(d.lat, d.lon).then((s) => live && setPlace(s));
    return () => {
      live = false;
    };
  }, [d.lat, d.lon]);
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Txt weight="bold" style={{ fontSize: 17, color: theme.text }}>
            {KIND[d.category] ?? "Camera"} may be gone
          </Txt>
          <Txt style={{ fontSize: 13, color: theme.textSecondary }}>Last "gone" answer {formatUpdated(d.last_gone_at)}</Txt>
        </View>
        <Pressable
          onPress={() => onShow(d)}
          accessibilityRole="button"
          accessibilityLabel="Show on map"
          style={({ pressed }) => [styles.show, { backgroundColor: theme.subtle, opacity: pressed ? 0.7 : 1 }]}
        >
          <PinIcon size={16} color={theme.accentIcon} />
          <Txt weight="semibold" style={{ fontSize: 13, color: theme.text }}>
            Map
          </Txt>
        </Pressable>
      </View>
      <View style={{ gap: 2 }}>
        <Txt style={{ fontSize: 14, color: theme.textSecondary }}>{place ?? `${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}`}</Txt>
        <Txt style={{ fontSize: 14, color: theme.textSecondary }}>
          {d.gone_votes} said gone · {d.still_there_votes} said still there
        </Txt>
        <Txt style={{ fontSize: 14, color: theme.textSecondary }}>
          {d.source === "osm" ? "OpenStreetMap camera" : "Community camera"}
          {d.status === "active" ? " · still on the map" : " · already hidden by votes"}
        </Txt>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {[
          <Pressable
            key="keep"
            disabled={busy}
            onPress={() => onAct(d, "keep")}
            accessibilityRole="button"
            style={({ pressed }) => [styles.btn, { backgroundColor: theme.subtle, opacity: busy ? 0.5 : pressed ? 0.8 : 1 }]}
          >
            <Txt weight="bold" style={{ fontSize: 15, color: theme.text }}>
              Keep on map
            </Txt>
          </Pressable>,
          <Pressable
            key="remove"
            disabled={busy}
            onPress={() => onAct(d, "remove")}
            accessibilityRole="button"
            style={({ pressed }) => [styles.btn, { backgroundColor: theme.badBg, opacity: busy ? 0.5 : pressed ? 0.8 : 1 }]}
          >
            <Txt weight="bold" style={{ fontSize: 15, color: theme.badText }}>
              Remove
            </Txt>
          </Pressable>,
        ]}
      </View>
    </View>
  );
}

/** Admin-only list of flagged reports (new cameras from new reporters, and issue reports). */
export function ReviewScreen({
  visible,
  theme,
  onClose,
  onShowOnMap,
  onChanged,
}: {
  visible: boolean;
  theme: T;
  onClose: () => void;
  onShowOnMap: (lat: number, lon: number) => void;
  onChanged: (pending: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PendingReport[] | null>(null);
  const [disputed, setDisputed] = useState<Disputed[]>([]);
  const [busyDisputed, setBusyDisputed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const changedRef = useRef(onChanged);
  changedRef.current = onChanged;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, d] = await Promise.all([listPendingReports(), listDisputed().catch(() => [] as Disputed[])]);
      setItems(r);
      setDisputed(d);
      changedRef.current(r.length + d.length);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load reports.");
    }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const act = (r: PendingReport, action: ModerateAction) => {
    const run = async () => {
      setBusyId(r.id);
      try {
        const res = await moderateReport(r.id, action);
        setItems((xs) => {
          // "Remove camera" also settles other reports about the same camera.
          const rest = (xs ?? []).filter(
            (x) => x.id !== r.id && !(action === "remove_camera" && r.point && x.point?.id === r.point.id)
          );
          return rest;
        });
        onChanged(res.pending + disputed.length);
      } catch (e: any) {
        Alert.alert("Couldn't save that", e?.message ?? "Try again.");
      } finally {
        setBusyId(null);
      }
    };
    if (action === "reject" || action === "remove_camera") {
      Alert.alert(
        action === "reject" ? "Reject this camera?" : "Remove this camera?",
        "It will disappear from the map for everyone.",
        [
          { text: "Cancel", style: "cancel" },
          { text: action === "reject" ? "Reject" : "Remove", style: "destructive", onPress: run },
        ]
      );
    } else run();
  };

  const actDisputed = (d: Disputed, action: "keep" | "remove") => {
    const run = async () => {
      setBusyDisputed(d.id);
      try {
        await resolveDisputed(d.id, action);
        const rest = disputed.filter((x) => x.id !== d.id);
        setDisputed(rest);
        changedRef.current((items?.length ?? 0) + rest.length);
      } catch (e: any) {
        Alert.alert("Couldn't save that", e?.message ?? "Try again.");
      } finally {
        setBusyDisputed(null);
      }
    };
    if (action === "remove") {
      Alert.alert("Remove this camera?", "It will disappear from the map for everyone, even if OpenStreetMap still lists it.", [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: run },
      ]);
    } else run();
  };
  const total = items == null ? null : items.length + disputed.length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.mapFallback }}>
        <View style={[styles.header, { borderBottomColor: theme.divider, backgroundColor: theme.surface }]}>
          <View style={{ flex: 1 }}>
            <Txt weight="bold" style={{ fontSize: 22, color: theme.text }}>
              Review reports
            </Txt>
            <Txt style={{ fontSize: 13, color: theme.textSecondary }}>
              {total == null ? "Loading…" : total === 0 ? "All caught up" : `${total} waiting`}
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
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
        >
          {error ? <Txt style={{ color: theme.badText, fontSize: 15 }}>{error}</Txt> : null}
          {items == null && !error ? <ActivityIndicator color={theme.textSecondary} style={{ marginTop: 40 }} /> : null}
          {total === 0 ? (
            <View style={{ alignItems: "center", gap: 6, marginTop: 60 }}>
              <Txt weight="bold" style={{ fontSize: 18, color: theme.text }}>
                Nothing to review
              </Txt>
              <Txt style={{ fontSize: 15, color: theme.textSecondary, textAlign: "center" }}>
                New cameras from new reporters, "report an issue" flags and cameras drivers say are gone show up here.
              </Txt>
            </View>
          ) : null}
          {disputed.length ? (
            <Txt weight="semibold" style={{ fontSize: 12, letterSpacing: 0.6, color: theme.textSecondary, marginLeft: 4 }}>
              DRIVERS SAY THESE ARE GONE
            </Txt>
          ) : null}
          {disputed.map((d) => (
            <DisputedCard
              key={`d${d.id}`}
              d={d}
              theme={theme}
              busy={busyDisputed === d.id}
              onAct={actDisputed}
              onShow={(x) => onShowOnMap(x.lat, x.lon)}
            />
          ))}
          {disputed.length && items?.length ? (
            <Txt weight="semibold" style={{ fontSize: 12, letterSpacing: 0.6, color: theme.textSecondary, marginLeft: 4 }}>
              REPORTS
            </Txt>
          ) : null}
          {items?.map((r) => (
            <ReportCard
              key={r.id}
              r={r}
              theme={theme}
              busy={busyId === r.id}
              onAct={act}
              onShow={(x) => onShowOnMap(x.lat, x.lon)}
            />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  card: { borderRadius: 18, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  show: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 32, borderRadius: 16 },
  btn: { flex: 1, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
