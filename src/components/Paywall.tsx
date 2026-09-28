import type React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PRO_PRICE, startTrial, trialLeftText, TRIAL_DAYS, usePro } from "../lib/pro";
import type { Theme } from "../theme";
import { CameraGlyph, CheckIcon, ClockIcon, CloseIcon, HomeIcon, PinIcon, PoliceIcon, SpeedGlyph } from "./Icons";
import { ManeuverIcon, SpeakerIcon } from "./Navigation";
import { DensityIcon } from "./Community";
import { Txt } from "./Txt";

type T = Theme & { isDark: boolean };

function Feature({ theme, icon, bg, title, body }: { theme: T; icon: React.ReactNode; bg: string; title: string; body: string }) {
  return (
    <View style={styles.feature}>
      <View style={[styles.featureIcon, { backgroundColor: bg }]}>{icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="bold" style={{ fontSize: 16, color: theme.text }}>
          {title}
        </Txt>
        <Txt style={{ fontSize: 14, lineHeight: 19, color: theme.textSecondary }}>{body}</Txt>
      </View>
    </View>
  );
}

/** Upgrade screen: what Pro adds, the 3-day free trial, and the price. */
export function Paywall({
  visible,
  theme,
  reason,
  onClose,
  onStarted,
}: {
  visible: boolean;
  theme: T;
  /** Short line about what the person tapped, e.g. "Police alerts are part of Pro." */
  reason?: string | null;
  onClose: () => void;
  onStarted: () => void;
}) {
  const insets = useSafeAreaInsets();
  const pro = usePro();
  const canTrial = pro.kind === "free";
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.surface }}>
        <View style={styles.header}>
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
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 22 }}>
          <View style={{ gap: 8 }}>
            <View style={[styles.pill, { backgroundColor: theme.badgeBg }]}>
              <Txt weight="bold" style={{ fontSize: 13, color: theme.badgeText, letterSpacing: 0.4 }}>
                DECAM GPS PRO
              </Txt>
            </View>
            <Txt weight="extrabold" style={{ fontSize: 30, lineHeight: 35, letterSpacing: -0.5, color: theme.text }}>
              Know what's ahead
            </Txt>
            <Txt style={{ fontSize: 16, lineHeight: 22, color: theme.textSecondary }}>
              {reason ?? "The plate-reader map, safer routes, detours and crash alerts stay free. Pro turns DeCam GPS into a full co-pilot."}
            </Txt>
          </View>

          <View style={{ gap: 16 }}>
            <Feature
              theme={theme}
              bg={theme.markerFill}
              icon={<CameraGlyph size={22} color={theme.markerGlyph} />}
              title="Drive mode alerts"
              body="Just drive. Get warned about plate readers, cameras and police ahead, no route needed."
            />
            <Feature
              theme={theme}
              bg={theme.policeFill}
              icon={<PoliceIcon size={22} color={theme.alertGlyph} />}
              title="Police alerts"
              body="See police reported by other drivers on the map and on your route."
            />
            <Feature
              theme={theme}
              bg={theme.speedFill}
              icon={<SpeedGlyph size={22} color={theme.speedGlyph} />}
              title="Speed & red-light cameras"
              body="On the map and on your routes, with speed limits where known."
            />
            <Feature
              theme={theme}
              bg={theme.accent}
              icon={<SpeakerIcon muted={false} color={theme.onAccent} />}
              title="Voice guidance"
              body="Spoken turn-by-turn directions and warnings about cameras and police ahead."
            />
            <Feature
              theme={theme}
              bg={theme.crashFill}
              icon={<Txt weight="extrabold" style={{ fontSize: 17, color: "#FFFFFF" }}>55</Txt>}
              title="Speeding warning"
              body="A spoken heads-up when you go 5+ mph over the limit."
            />
            <Feature
              theme={theme}
              bg={theme.accent}
              icon={<ManeuverIcon modifier="slight right" size={26} color={theme.onAccent} />}
              title="Lane guidance"
              body="Arrows that show which lane to be in before each turn."
            />
            <Feature
              theme={theme}
              bg={theme.goodText}
              icon={<ClockIcon size={20} color={theme.surface} />}
              title="Leave later"
              body="Plan a trip for later today or tomorrow with the traffic expected then."
            />
            <Feature
              theme={theme}
              bg={theme.markerFill}
              icon={<PinIcon size={20} color={theme.markerGlyph} />}
              title="Multiple stops & saved places"
              body="Add up to 3 stops on the way, and save places like Gym or Mom's house."
            />
            <Feature
              theme={theme}
              bg={theme.badBg}
              icon={<DensityIcon size={22} color={theme.badText} />}
              title="Camera density map"
              body="See which neighborhoods have the most plate readers."
            />
            <Feature
              theme={theme}
              bg={theme.redLightFill}
              icon={<HomeIcon size={20} color={theme.redLightGlyph} />}
              title="Commute watch"
              body="Know when a new plate reader shows up between Home and Work."
            />
            <Feature
              theme={theme}
              bg={theme.speedFill}
              icon={<ClockIcon size={20} color={theme.speedGlyph} />}
              title="Your privacy report"
              body="Weekly plate readers passed and avoided. Stays on your phone."
            />
            <Feature
              theme={theme}
              bg={theme.subtle}
              icon={<PinIcon size={20} color={theme.accentIcon} />}
              title="Map styles"
              body="Detailed, satellite and hybrid maps."
            />
          </View>

          <View style={[styles.freeBox, { backgroundColor: theme.subtle }]}>
            <CheckIcon color={theme.goodText} />
            <Txt style={{ flex: 1, fontSize: 14, color: theme.textSecondary }}>
              Always free: crash and road-object alerts, reporting police, the plate-reader map, routes with camera counts, detours, avoiding all plate readers, avoid tolls and highways, the speed limit sign, sharing your ETA, on-screen directions, search, Home and Work.
            </Txt>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8, borderTopColor: theme.divider }]}>
          {pro.kind === "trial" ? (
            <Txt weight="semibold" style={{ textAlign: "center", fontSize: 15, color: theme.text }}>
              Your free trial is on · {trialLeftText(pro.trialMsLeft)}
            </Txt>
          ) : pro.kind === "gift" ? (
            <Txt weight="semibold" style={{ textAlign: "center", fontSize: 15, color: theme.text }}>
              Free Pro from an invite · {trialLeftText(pro.trialMsLeft)}
            </Txt>
          ) : pro.kind === "admin" || pro.kind === "pro" ? (
            <Txt weight="semibold" style={{ textAlign: "center", fontSize: 15, color: theme.text }}>
              You have Pro.
            </Txt>
          ) : null}
          {canTrial ? (
            <Pressable
              onPress={() => {
                startTrial();
                onStarted();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.primary, { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 }]}
            >
              <Txt weight="bold" style={{ color: theme.onAccent, fontSize: 17 }}>
                Start {TRIAL_DAYS}-day free trial
              </Txt>
            </Pressable>
          ) : !pro.isPro ? (
            <Pressable
              disabled
              accessibilityRole="button"
              style={[styles.primary, { backgroundColor: theme.accent, opacity: 0.5 }]}
            >
              <Txt weight="bold" style={{ color: theme.onAccent, fontSize: 17 }}>
                Subscribe · {PRO_PRICE}
              </Txt>
            </Pressable>
          ) : null}
          <Txt style={{ textAlign: "center", fontSize: 12, lineHeight: 17, color: theme.textSecondary }}>
            {canTrial
              ? `Free for ${TRIAL_DAYS} days, then ${PRO_PRICE}. Cancel anytime.`
              : pro.kind === "trial_ended"
                ? `Your free trial has ended. Subscriptions (${PRO_PRICE}) open when DeCam GPS launches on the App Store.`
                : `Then ${PRO_PRICE}. Subscriptions open when DeCam GPS launches on the App Store.`}
          </Txt>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "flex-end", padding: 16 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  feature: { flexDirection: "row", alignItems: "center", gap: 14 },
  featureIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  freeBox: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 14, alignItems: "flex-start" },
  footer: { paddingHorizontal: 24, paddingTop: 14, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  primary: { height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
