import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
}: {
  visible: boolean;
  theme: T;
  voiceOn: boolean;
  onVoiceChange: (on: boolean) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const appearance = useAppearance();
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
              NAVIGATION
            </Txt>
            <View style={[styles.card, styles.row, { backgroundColor: theme.surface }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="semibold" style={{ fontSize: 16, color: theme.text }}>
                  Voice guidance
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
