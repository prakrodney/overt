import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { clearPrivacyReport, weeklySummary, type Week } from "../lib/privacyReport";
import type { Theme } from "../theme";
import { CloseIcon } from "./Icons";
import { Txt } from "./Txt";

type T = Theme & { isDark: boolean };

/** Pro: weekly summary of plate readers passed and avoided (stored only on this phone). */
export function PrivacyReportSheet({ visible, theme, onClose }: { visible: boolean; theme: T; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [weeks, setWeeks] = useState<Week[] | null>(null);
  useEffect(() => {
    if (visible) weeklySummary(4).then(setWeeks);
  }, [visible]);
  const w = weeks?.[0];
  const max = Math.max(1, ...(weeks ?? []).map((x) => x.passed + x.avoided));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.mapFallback }}>
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.divider }]}>
          <Txt weight="bold" style={{ flex: 1, fontSize: 22, color: theme.text }}>
            Your privacy report
          </Txt>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={[styles.close, { backgroundColor: theme.closeBg }]}>
            <CloseIcon color={theme.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}>
          <View style={styles.stats}>
            <View style={[styles.stat, { backgroundColor: theme.surface }]}>
              <Txt weight="extrabold" style={{ fontSize: 34, color: theme.text }}>
                {w?.passed ?? "–"}
              </Txt>
              <Txt style={{ fontSize: 13, color: theme.textSecondary, textAlign: "center" }}>plate readers passed this week</Txt>
            </View>
            <View style={[styles.stat, { backgroundColor: theme.surface }]}>
              <Txt weight="extrabold" style={{ fontSize: 34, color: theme.goodText }}>
                {w?.avoided ?? "–"}
              </Txt>
              <Txt style={{ fontSize: 13, color: theme.textSecondary, textAlign: "center" }}>avoided with safer routes</Txt>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <Txt weight="semibold" style={{ fontSize: 15, color: theme.text }}>
              Last 4 weeks
            </Txt>
            {(weeks ?? []).map((x) => (
              <View key={x.label} style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Txt style={{ fontSize: 13, color: theme.textSecondary }}>{x.label}</Txt>
                  <Txt style={{ fontSize: 13, color: theme.textSecondary }}>
                    {x.passed} passed · {x.avoided} avoided · {x.trips} {x.trips === 1 ? "trip" : "trips"}
                  </Txt>
                </View>
                <View style={[styles.bar, { backgroundColor: theme.subtle }]}>
                  <View style={{ width: `${(x.passed / max) * 100}%`, backgroundColor: theme.cone, borderRadius: 4 }} />
                  <View style={{ width: `${(x.avoided / max) * 100}%`, backgroundColor: theme.goodText, borderRadius: 4, opacity: 0.8 }} />
                </View>
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: 14 }}>
              <View style={styles.legend}>
                <View style={[styles.dot, { backgroundColor: theme.cone }]} />
                <Txt style={{ fontSize: 12, color: theme.textSecondary }}>Passed</Txt>
              </View>
              <View style={styles.legend}>
                <View style={[styles.dot, { backgroundColor: theme.goodText }]} />
                <Txt style={{ fontSize: 12, color: theme.textSecondary }}>Avoided</Txt>
              </View>
            </View>
          </View>

          <Txt style={{ fontSize: 13, lineHeight: 19, color: theme.textSecondary }}>
            Counted from routes you navigate (compared with the fastest route) and plate readers drive mode warns you about
            and you drive past. This report is kept only on your phone and never uploaded.
          </Txt>
          <Pressable
            onPress={() =>
              Alert.alert("Reset report?", "This clears your privacy report on this phone.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Reset",
                  style: "destructive",
                  onPress: () => clearPrivacyReport().then(() => weeklySummary(4).then(setWeeks)),
                },
              ])
            }
            accessibilityRole="button"
            style={({ pressed }) => [styles.reset, { backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 }]}
          >
            <Txt weight="semibold" style={{ fontSize: 15, color: theme.badText }}>
              Reset report
            </Txt>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  stats: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, borderRadius: 16, padding: 16, alignItems: "center", gap: 4 },
  card: { borderRadius: 16, padding: 14, gap: 12 },
  bar: { height: 10, borderRadius: 5, flexDirection: "row", overflow: "hidden", gap: 2 },
  legend: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  reset: { height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
