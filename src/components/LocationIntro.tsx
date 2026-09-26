import { Image, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Theme } from "../theme";
import { LocateIcon } from "./Icons";
import { Txt } from "./Txt";

type T = Theme & { isDark: boolean };

/** The app's logo (same image as the app icon), with iOS-style rounded corners. */
export function AppLogo({ size = 88 }: { size?: number }) {
  return (
    <Image
      source={require("../../assets/icon.png")}
      style={{ width: size, height: size, borderRadius: size * 0.225 }}
      accessibilityLabel="DeCam GPS"
    />
  );
}

function Point({ theme, title, body }: { theme: T; title: string; body: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      <View style={[styles.bullet, { backgroundColor: theme.accentIcon }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="semibold" style={{ fontSize: 16, color: theme.text }}>
          {title}
        </Txt>
        <Txt style={{ fontSize: 15, lineHeight: 21, color: theme.textSecondary }}>{body}</Txt>
      </View>
    </View>
  );
}

/** First launch: explains why DeCam GPS wants your location before iOS asks. */
export function LocationIntro({ theme, onContinue, onSkip }: { theme: T; onContinue: () => void; onSkip: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.fill,
        { backgroundColor: theme.surface, paddingTop: insets.top + 48, paddingBottom: Math.max(insets.bottom, 16) + 8 },
      ]}
    >
      <View style={{ flex: 1, gap: 28 }}>
        <AppLogo />
        <View style={{ gap: 10 }}>
          <Txt weight="extrabold" style={{ fontSize: 32, lineHeight: 38, letterSpacing: -0.6, color: theme.text }}>
            See the cameras around you
          </Txt>
          <Txt style={{ fontSize: 17, lineHeight: 24, color: theme.textSecondary }}>
            DeCam GPS maps license plate readers and finds routes that pass fewer of them.
          </Txt>
        </View>
        <View style={{ gap: 18 }}>
          <Point theme={theme} title="Centers the map on you" body="So you see what's documented nearby first." />
          <Point
            theme={theme}
            title="Plans routes from where you are"
            body="Your start and end points go to Mapbox to draw the route. DeCam GPS never stores your trips."
          />
          <Point
            theme={theme}
            title="Checks reports are real"
            body="When you report a camera, we check you're nearby. Your location isn't saved with it."
          />
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Pressable
          onPress={onContinue}
          accessibilityRole="button"
          style={({ pressed }) => [styles.primary, { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 }]}
        >
          <LocateIcon size={20} color={theme.onAccent} />
          <Txt weight="bold" style={{ color: theme.onAccent, fontSize: 17 }}>
            Continue
          </Txt>
        </Pressable>
        <Pressable onPress={onSkip} accessibilityRole="button" style={styles.secondary} hitSlop={4}>
          <Txt weight="semibold" style={{ color: theme.textSecondary, fontSize: 16 }}>
            Not now
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, paddingHorizontal: 28 },
  bullet: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
  primary: {
    height: 54,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondary: { height: 48, alignItems: "center", justifyContent: "center" },
});
