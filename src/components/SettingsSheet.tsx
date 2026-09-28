import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import { isPreviewingFree, PRO_PRICE, setPreviewFree, trialLeftText, type ProStatus } from "../lib/pro";
import { setPref, usePrefs, type MapStyle } from "../lib/prefs";
import { setAppearance, useAppearance, type Appearance, type Theme } from "../theme";
import { CloseIcon } from "./Icons";
import { Txt } from "./Txt";

type T = Theme & { isDark: boolean };

const OPTIONS: { id: Appearance; label: string }[] = [
  { id: "system", label: "Automatic" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/** App settings: appearance (automatic / light / dark) and voice guidance. */
export function SettingsSheet({
  visible,
  theme,
  voiceOn,
  onVoiceChange,
  onClose,
  historyCount,
  onClearHistory,
  pro,
  onOpenPro,
  isAdmin = false,
  onOpenPrivacyReport,
  onOpenInvite,
  onOpenBadges,
}: {
  visible: boolean;
  theme: T;
  voiceOn: boolean;
  onVoiceChange: (on: boolean) => void;
  onClose: () => void;
  /** How many recent destinations are saved on this phone. */
  historyCount: number;
  onClearHistory: () => void;
  pro: ProStatus;
  onOpenPro: () => void;
  isAdmin?: boolean;
  onOpenPrivacyReport: () => void;
  onOpenInvite: () => void;
  onOpenBadges: () => void;
}) {
  const insets = useSafeAreaInsets();
  const appearance = useAppearance();
  const [preview, setPreview] = useState(isPreviewingFree());
  const prefs = usePrefs();
  const proOnly = (fn: () => void) => () => (pro.isPro ? fn() : onOpenPro());
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.mapFallback }}>
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.divider }]}>
          <Txt weight="bold" style={{ flex: 1, fontSize: 22, color: theme.text }}>
            Settings
          </Txt>
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
        <ScrollView contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: insets.bottom + 24 }}>
          <View style={{ gap: 8 }}>
            <Txt weight="semibold" style={[styles.label, { color: theme.textSecondary }]}>
              YOUR PLAN
            </Txt>
            <Pressable
              onPress={onOpenPro}
              accessibilityRole="button"
              style={({ pressed }) => [styles.card, styles.row, { backgroundColor: theme.surface, opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="bold" style={{ fontSize: 17, color: theme.text }}>
                  {pro.kind === "gift"
                    ? "Pro from an invite"
                    : pro.kind === "trial"
                    ? "Pro free trial"
                    : pro.kind === "pro" || pro.kind === "admin"
                      ? "DeCam GPS Pro"
                      : "Free"}
                </Txt>
                <Txt style={{ fontSize: 13, color: theme.textSecondary }}>
                  {pro.kind === "gift"
                    ? `${trialLeftText(pro.trialMsLeft)} · thanks for sharing DeCam GPS`
                    : pro.kind === "trial"
                    ? `${trialLeftText(pro.trialMsLeft)} · then ${PRO_PRICE}`
                    : pro.kind === "admin"
                      ? "Included with your admin account"
                      : pro.kind === "pro"
                        ? "Thanks for supporting DeCam GPS"
                        : "Police alerts, speed cameras and voice with Pro"}
                </Txt>
              </View>
              <Txt weight="bold" style={{ fontSize: 15, color: theme.accentIcon }}>
                {pro.isPro ? "Details" : pro.kind === "free" ? "Try free" : "Upgrade"}
              </Txt>
            </Pressable>
            {isAdmin ? (
              <View style={[styles.card, styles.row, { backgroundColor: theme.surface }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt weight="semibold" style={{ fontSize: 16, color: theme.text }}>
                    Preview the free version
                  </Txt>
                  <Txt style={{ fontSize: 13, color: theme.textSecondary }}>
                    Admin only: see the app the way free users do. Resets when the app restarts.
                  </Txt>
                </View>
                <Switch
                  value={preview}
                  onValueChange={(v) => {
                    setPreview(v);
                    setPreviewFree(v);
                  }}
                  trackColor={{ true: theme.accent }}
                  accessibilityLabel="Preview the free version"
                />
              </View>
            ) : null}
          </View>

          <View style={{ gap: 8 }}>
            <Txt weight="semibold" style={[styles.label, { color: theme.textSecondary }]}>
              APPEARANCE
            </Txt>
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <View style={[styles.segment, { backgroundColor: theme.subtle }]}>
                {OPTIONS.map((o) => {
                  const on = o.id === appearance;
                  return (
                    <Pressable
                      key={o.id}
                      onPress={() => setAppearance(o.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={[
                        styles.segmentItem,
                        on && { backgroundColor: theme.surface, shadowColor: theme.shadowColor, shadowOpacity: 0.12 },
                      ]}
                    >
                      <Txt weight={on ? "bold" : "semibold"} style={{ fontSize: 15, color: on ? theme.text : theme.textSecondary }}>
                        {o.label}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
              <Txt style={{ fontSize: 13, color: theme.textSecondary }}>
                Automatic follows your iPhone's light or dark setting.
              </Txt>
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Txt weight="semibold" style={[styles.label, { color: theme.textSecondary }]}>
              COMMUNITY
            </Txt>
            <Pressable
              onPress={onOpenInvite}
              accessibilityRole="button"
              style={({ pressed }) => [styles.card, styles.row, { backgroundColor: theme.surface, opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="semibold" style={{ fontSize: 16, color: theme.text }}>
                  Invite a friend
                </Txt>
                <Txt style={{ fontSize: 13, color: theme.textSecondary }}>
                  You both get a free week of Pro. Have a code? Enter it here too.
                </Txt>
              </View>
              <Txt weight="bold" style={{ fontSize: 18, color: theme.textSecondary }}>
                ›
              </Txt>
            </Pressable>
            <Pressable
              onPress={onOpenBadges}
              accessibilityRole="button"
              style={({ pressed }) => [styles.card, styles.row, { backgroundColor: theme.surface, opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="semibold" style={{ fontSize: 16, color: theme.text }}>
                  Your badges
                </Txt>
                <Txt style={{ fontSize: 13, color: theme.textSecondary }}>
                  Earned by adding cameras and keeping the map accurate.
                </Txt>
              </View>
              <Txt weight="bold" style={{ fontSize: 18, color: theme.textSecondary }}>
                ›
              </Txt>
            </Pressable>
            <View style={[styles.card, styles.row, { backgroundColor: theme.surface }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="semibold" style={{ fontSize: 16, color: theme.text }}>
                  Ask "Still there?" about reports
                </Txt>
                <Txt style={{ fontSize: 13, color: theme.textSecondary }}>
                  After you pass a police, crash or object report, one tap says if it's still there. Best answered by a passenger.
                </Txt>
              </View>
              <Switch
                value={prefs.askStillHere}
                onValueChange={(v) => setPref("askStillHere", v)}
                trackColor={{ true: theme.accent }}
                accessibilityLabel="Ask if reports are still there"
              />
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Txt weight="semibold" style={[styles.label, { color: theme.textSecondary }]}>
              NAVIGATION
            </Txt>
            <View style={[styles.card, styles.row, { backgroundColor: theme.surface }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="semibold" style={{ fontSize: 16, color: theme.text }}>
                  Voice guidance{pro.isPro ? "" : " · Pro"}
                </Txt>
                <Txt style={{ fontSize: 13, color: theme.textSecondary }}>
                  Spoken turns and camera / police warnings while navigating.
                </Txt>
              </View>
              <Switch
                value={voiceOn}
                onValueChange={onVoiceChange}
                trackColor={{ true: theme.accent }}
                accessibilityLabel="Voice guidance"
              />
            </View>
            <View style={[styles.card, styles.row, { backgroundColor: theme.surface }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="semibold" style={{ fontSize: 16, color: theme.text }}>
                  Drive mode alerts{pro.isPro ? "" : " · Pro"}
                </Txt>
                <Txt style={{ fontSize: 13, color: theme.textSecondary }}>
                  Warns about plate readers, speed and red-light cameras and police ahead, even without a route.
                </Txt>
              </View>
              <Switch
                value={pro.isPro && prefs.driveAlerts}
                onValueChange={(v) => (pro.isPro ? setPref("driveAlerts", v) : onOpenPro())}
                trackColor={{ true: theme.accent }}
                accessibilityLabel="Drive mode alerts"
              />
            </View>
            <View style={[styles.card, styles.row, { backgroundColor: theme.surface }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="semibold" style={{ fontSize: 16, color: theme.text }}>
                  Speeding warning{pro.isPro ? "" : " · Pro"}
                </Txt>
                <Txt style={{ fontSize: 13, color: theme.textSecondary }}>
                  A spoken reminder when you're 5+ mph over the limit while navigating. The speed limit sign is free.
                </Txt>
              </View>
              <Switch
                value={pro.isPro && prefs.speedWarn}
                onValueChange={(v) => (pro.isPro ? setPref("speedWarn", v) : onOpenPro())}
                trackColor={{ true: theme.accent }}
                accessibilityLabel="Speeding warning"
              />
            </View>
            <Pressable
              onPress={proOnly(onOpenPrivacyReport)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.card, styles.row, { backgroundColor: theme.surface, opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="semibold" style={{ fontSize: 16, color: theme.text }}>
                  Your privacy report{pro.isPro ? "" : " · Pro"}
                </Txt>
                <Txt style={{ fontSize: 13, color: theme.textSecondary }}>
                  Plate readers you passed and avoided each week. Kept only on this phone.
                </Txt>
              </View>
              <Txt weight="bold" style={{ fontSize: 18, color: theme.textSecondary }}>
                ›
              </Txt>
            </Pressable>
          </View>

          <View style={{ gap: 8 }}>
            <Txt weight="semibold" style={[styles.label, { color: theme.textSecondary }]}>
              MAP STYLE
            </Txt>
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <View style={[styles.segment, { backgroundColor: theme.subtle }]}>
                {(
                  [
                    { id: "mutedStandard", label: "Clean" },
                    { id: "standard", label: "Detailed" },
                    { id: "satellite", label: "Satellite" },
                    { id: "hybrid", label: "Hybrid" },
                  ] as { id: MapStyle; label: string }[]
                ).map((o) => {
                  const on = (pro.isPro ? prefs.mapStyle : "mutedStandard") === o.id;
                  return (
                    <Pressable
                      key={o.id}
                      onPress={() => (o.id === "mutedStandard" || pro.isPro ? setPref("mapStyle", o.id) : onOpenPro())}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={[
                        styles.segmentItem,
                        on && { backgroundColor: theme.surface, shadowColor: theme.shadowColor, shadowOpacity: 0.12 },
                      ]}
                    >
                      <Txt weight={on ? "bold" : "semibold"} style={{ fontSize: 13, color: on ? theme.text : theme.textSecondary }}>
                        {o.label}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
              <Txt style={{ fontSize: 13, color: theme.textSecondary }}>
                {pro.isPro ? "Choose how the map looks." : "Detailed, Satellite and Hybrid maps are part of Pro."}
              </Txt>
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Txt weight="semibold" style={[styles.label, { color: theme.textSecondary }]}>
              HISTORY
            </Txt>
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <Txt style={{ fontSize: 14, color: theme.textSecondary }}>
                {historyCount === 0
                  ? "No recent places saved."
                  : `${historyCount} recent ${historyCount === 1 ? "place is" : "places are"} saved on this phone.`}{" "}
                DeCam GPS never stores your trips on its servers.
              </Txt>
              <Pressable
                disabled={historyCount === 0}
                onPress={() =>
                  Alert.alert("Clear history?", "Your recent places will be removed from this phone. Home and Work stay.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Clear", style: "destructive", onPress: onClearHistory },
                  ])
                }
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.dangerBtn,
                  { backgroundColor: theme.badBg, opacity: historyCount === 0 ? 0.45 : pressed ? 0.8 : 1 },
                ]}
              >
                <Txt weight="bold" style={{ fontSize: 16, color: theme.badText }}>
                  Clear history
                </Txt>
              </Pressable>
            </View>
          </View>
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
  label: { fontSize: 12, letterSpacing: 0.6, marginLeft: 4 },
  card: { borderRadius: 16, padding: 14, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  dangerBtn: { height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", borderRadius: 12, padding: 3 },
  segmentItem: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
});
