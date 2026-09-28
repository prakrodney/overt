import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Polygon } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import {
  badgesFor,
  myContributions,
  myInvite,
  redeemInvite,
  type Badge,
  type Contributions,
  type DensityCell,
  type InviteInfo,
} from "../lib/community";
import { fonts, type Theme } from "../theme";
import { CloseIcon } from "./Icons";
import { Txt } from "./Txt";

type T = Theme & { isDark: boolean };

// ---- "Still here?" -----------------------------------------------------------------------------

/** Asked right after you drive past a camera. Big buttons; goes away on its own. */
export function StillHerePrompt({
  theme,
  label,
  bottom,
  onAnswer,
  onDismiss,
}: {
  theme: T;
  /** "plate reader", "speed camera"… */
  label: string;
  /** Float above the bottom of the screen (while navigating); otherwise it sits in the page flow. */
  bottom?: number;
  onAnswer: (stillThere: boolean) => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 15_000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <View
      style={[
        styles.prompt,
        bottom != null && { position: "absolute", left: 16, right: 16, bottom },
        {
          backgroundColor: theme.control,
          shadowColor: theme.shadowColor,
          shadowOpacity: theme.isDark ? 0.45 : 0.16,
        },
      ]}
    >
      <View style={styles.promptHead}>
        <Txt weight="bold" style={{ flex: 1, fontSize: 16, color: theme.text }}>
          Was that {label} still there?
        </Txt>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Not sure"
          hitSlop={10}
          style={[styles.closeSm, { backgroundColor: theme.closeBg }]}
        >
          <CloseIcon size={12} color={theme.textSecondary} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => onAnswer(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.bigBtn, { backgroundColor: theme.goodBg, opacity: pressed ? 0.8 : 1 }]}
        >
          <Txt weight="bold" style={{ fontSize: 16, color: theme.goodText }}>
            Still there
          </Txt>
        </Pressable>
        <Pressable
          onPress={() => onAnswer(false)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.bigBtn, { backgroundColor: theme.badBg, opacity: pressed ? 0.8 : 1 }]}
        >
          <Txt weight="bold" style={{ fontSize: 16, color: theme.badText }}>
            It's gone
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

// ---- Camera density map (Pro) --------------------------------------------------------------

/** Shaded squares: darker red = more plate readers in that square. Drawn inside the MapView. */
export function DensityLayer({ cells, isDark }: { cells: DensityCell[]; isDark: boolean }) {
  if (!cells.length) return null;
  // Scale against the busiest squares in view (90th percentile) so one hotspot doesn't wash out the rest.
  const sorted = cells.map((c) => c.count).sort((a, b) => a - b);
  const top = Math.max(3, sorted[Math.floor(sorted.length * 0.9)] ?? 1);
  return (
    <>
      {cells.map((c) => {
        const t = Math.min(1, Math.log1p(c.count) / Math.log1p(top));
        const a = 0.1 + t * 0.5;
        const { south: s, west: w, size: z } = c;
        return (
          <Polygon
            key={`d${s},${w},${z}`}
            coordinates={[
              { latitude: s, longitude: w },
              { latitude: s + z, longitude: w },
              { latitude: s + z, longitude: w + z },
              { latitude: s, longitude: w + z },
            ]}
            fillColor={isDark ? `rgba(255,90,78,${a.toFixed(2)})` : `rgba(224,53,43,${a.toFixed(2)})`}
            strokeColor="rgba(255,255,255,0.35)"
            strokeWidth={0.5}
            zIndex={1}
            tappable={false}
          />
        );
      })}
    </>
  );
}

export function DensityLegend({ theme, bottom, loading }: { theme: T; bottom: number; loading: boolean }) {
  const red = theme.isDark ? "255,90,78" : "224,53,43";
  return (
    <View
      pointerEvents="none"
      style={[styles.legend, { bottom, backgroundColor: theme.control, shadowColor: theme.shadowColor }]}
    >
      <Txt weight="semibold" style={{ fontSize: 12, color: theme.text }}>
        Plate readers per area
      </Txt>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Txt style={{ fontSize: 11, color: theme.textSecondary }}>Few</Txt>
        {[0.12, 0.25, 0.4, 0.6].map((a) => (
          <View key={a} style={{ width: 16, height: 10, borderRadius: 2, backgroundColor: `rgba(${red},${a})` }} />
        ))}
        <Txt style={{ fontSize: 11, color: theme.textSecondary }}>Many</Txt>
        {loading ? <ActivityIndicator size="small" color={theme.textSecondary} /> : null}
      </View>
    </View>
  );
}

export function DensityIcon({ color, size = 22 }: { color: string; size?: number }) {
  const c = { stroke: color, strokeWidth: 1.8, fill: "none" };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" {...c} />
      <Path d="M13 4h7v7h-7z" fill={color} opacity={0.55} />
      <Path d="M4 13h7v7H4z" fill={color} opacity={0.25} />
    </Svg>
  );
}

// ---- Shared modal chrome -----------------------------------------------------------------------

function Sheet({
  visible,
  theme,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  theme: T;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.mapFallback }}>
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.divider }]}>
          <Txt weight="bold" style={{ flex: 1, fontSize: 22, color: theme.text }}>
            {title}
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
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}
        >
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---- Invite a friend -------------------------------------------------------------------------

export function InviteSheet({
  visible,
  theme,
  onClose,
  onMessage,
}: {
  visible: boolean;
  theme: T;
  onClose: () => void;
  onMessage: (text: string) => void;
}) {
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setRedeemError(null);
    myInvite()
      .then(setInfo)
      .catch((e) => setError(e?.message ?? "Couldn't load your invite code. Check your connection."));
  }, [visible]);

  const share = () => {
    if (!info) return;
    Share.share({
      message:
        `I use DeCam GPS to see license plate reader cameras and drive around them. ` +
        `Get it and enter my code ${info.code} (Settings › Invite a friend) and we both get a free week of Pro.`,
    }).catch(() => {});
  };

  const redeem = async () => {
    Keyboard.dismiss();
    setBusy(true);
    setRedeemError(null);
    try {
      await redeemInvite(code);
      setCode("");
      onMessage("Code accepted! You and your friend each got a free week of Pro.");
      onClose();
    } catch (e: any) {
      setRedeemError(e?.message ?? "Couldn't use that code. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} theme={theme} title="Invite a friend" onClose={onClose}>
      <View style={[styles.card, { backgroundColor: theme.surface, alignItems: "center" }]}>
        <Txt style={{ fontSize: 15, color: theme.textSecondary, textAlign: "center" }}>
          When a friend enters your code, you both get a free week of DeCam GPS Pro.
        </Txt>
        {info ? (
          <>
            <Txt
              weight="extrabold"
              selectable
              accessibilityLabel={`Your code: ${info.code.split("").join(" ")}`}
              style={{ fontSize: 40, letterSpacing: 6, color: theme.text, marginVertical: 4 }}
            >
              {info.code}
            </Txt>
            <Pressable
              onPress={share}
              accessibilityRole="button"
              style={({ pressed }) => [styles.primary, { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 }]}
            >
              <Txt weight="bold" style={{ color: theme.onAccent, fontSize: 17 }}>
                Share my code
              </Txt>
            </Pressable>
            <Txt style={{ fontSize: 13, color: theme.textSecondary, textAlign: "center" }}>
              {info.friends === 0
                ? "No friends have joined with your code yet."
                : `${info.friends} ${info.friends === 1 ? "friend has" : "friends have"} joined with your code.`}
              {info.friends >= 10 ? " You've earned the most free weeks (10)." : ""}
            </Txt>
          </>
        ) : error ? (
          <Txt style={{ fontSize: 14, color: theme.badText, textAlign: "center" }}>{error}</Txt>
        ) : (
          <ActivityIndicator color={theme.textSecondary} />
        )}
      </View>

      {info && !info.used_code ? (
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Txt weight="semibold" style={{ fontSize: 16, color: theme.text }}>
            Got a code from a friend?
          </Txt>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="ABC123"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              returnKeyType="done"
              onSubmitEditing={() => code.trim().length >= 6 && redeem()}
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.subtle, fontFamily: fonts.bold },
              ]}
              accessibilityLabel="Friend's invite code"
            />
            <Pressable
              onPress={redeem}
              disabled={busy || code.trim().length < 6}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.useBtn,
                { backgroundColor: theme.accent, opacity: busy || code.trim().length < 6 ? 0.5 : pressed ? 0.85 : 1 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={theme.onAccent} />
              ) : (
                <Txt weight="bold" style={{ color: theme.onAccent, fontSize: 16 }}>
                  Use code
                </Txt>
              )}
            </Pressable>
          </View>
          {redeemError ? <Txt style={{ fontSize: 13, color: theme.badText }}>{redeemError}</Txt> : null}
          <Txt style={{ fontSize: 12, color: theme.textSecondary }}>Each phone can use one friend's code.</Txt>
        </View>
      ) : null}
    </Sheet>
  );
}

// ---- Badges ----------------------------------------------------------------------------------

function Medal({ badge, theme }: { badge: Badge; theme: T }) {
  const c = badge.earned ? badge.color : theme.isDark ? "#4A4E56" : "#C9C7C2";
  return (
    <Svg width={48} height={48} viewBox="0 0 48 48">
      <Path d="M15 4h7l4 12h-7zM33 4h-7l-4 12h7z" fill={c} opacity={0.6} />
      <Circle cx={24} cy={29} r={15} fill={c} />
      <Circle cx={24} cy={29} r={11} fill="none" stroke="#FFFFFF" strokeWidth={1.6} opacity={0.7} />
      {badge.earned ? (
        <Path d="M18.5 29.5l4 4 7.5-8" stroke="#FFFFFF" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ) : (
        <Path d="M20 28.5v-2a4 4 0 0 1 8 0v2M19 28.5h10v7H19z" stroke="#FFFFFF" strokeWidth={1.8} strokeLinejoin="round" fill="none" />
      )}
    </Svg>
  );
}

export function BadgesSheet({ visible, theme, onClose }: { visible: boolean; theme: T; onClose: () => void }) {
  const [c, setC] = useState<Contributions | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    setError(null);
    myContributions()
      .then(setC)
      .catch((e) => setError(e?.message ?? "Couldn't load your badges. Check your connection."));
  }, [visible]);
  const badges = c ? badgesFor(c) : [];
  const earned = badges.filter((b) => b.earned).length;
  return (
    <Sheet visible={visible} theme={theme} title="Your badges" onClose={onClose}>
      {c ? (
        <>
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <Txt weight="bold" style={{ fontSize: 18, color: theme.text }}>
              {earned} of {badges.length} earned
            </Txt>
            <Txt style={{ fontSize: 14, color: theme.textSecondary }}>
              {c.cameras} {c.cameras === 1 ? "camera" : "cameras"} added · {c.confirms + c.gone} checks · {c.alerts} road{" "}
              {c.alerts === 1 ? "report" : "reports"}
            </Txt>
          </View>
          <View style={styles.grid}>
            {badges.map((b) => (
              <View
                key={b.id}
                style={[styles.badgeCard, { backgroundColor: theme.surface, opacity: b.earned ? 1 : 0.85 }]}
                accessibilityLabel={`${b.name}, ${b.earned ? "earned" : `not yet: ${b.how}`}`}
              >
                <Medal badge={b} theme={theme} />
                <Txt weight="bold" style={{ fontSize: 15, color: theme.text, textAlign: "center" }}>
                  {b.name}
                </Txt>
                <Txt style={{ fontSize: 12, color: theme.textSecondary, textAlign: "center" }}>{b.how}</Txt>
                {!b.earned ? (
                  <View style={[styles.bar, { backgroundColor: theme.subtle }]}>
                    <View style={{ width: `${Math.round(b.progress * 100)}%`, height: "100%", borderRadius: 3, backgroundColor: b.color }} />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
          <Txt style={{ fontSize: 12, color: theme.textSecondary, textAlign: "center" }}>
            Badges are tied to this phone's anonymous account. Nobody else can see them.
          </Txt>
        </>
      ) : error ? (
        <Txt style={{ fontSize: 14, color: theme.badText }}>{error}</Txt>
      ) : (
        <ActivityIndicator color={theme.textSecondary} />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  prompt: {
    borderRadius: 20,
    padding: 14,
    gap: 12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  promptHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  closeSm: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  bigBtn: { flex: 1, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  legend: {
    position: "absolute",
    left: 16,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
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
  card: { borderRadius: 16, padding: 16, gap: 10 },
  primary: { alignSelf: "stretch", height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, height: 50, borderRadius: 12, paddingHorizontal: 14, fontSize: 20, letterSpacing: 3 },
  useBtn: { height: 50, paddingHorizontal: 18, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  badgeCard: { width: "47.8%", borderRadius: 16, padding: 14, gap: 6, alignItems: "center" },
  bar: { alignSelf: "stretch", height: 6, borderRadius: 3, overflow: "hidden", marginTop: 2 },
});
