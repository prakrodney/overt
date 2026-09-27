import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { ADMIN_CODE } from "../lib/admin";
import { searchPlaces, type Place } from "../lib/geocode";
import { fonts, type Theme } from "../theme";
import { CloseIcon, PinIcon, SearchIcon } from "./Icons";
import { Txt } from "./Txt";

type T = Theme & { isDark: boolean };

/** Floating search pill with as-you-type results (Photon geocoder). */
export function SearchBar({
  theme,
  near,
  onSelect,
  onClear,
  placeholder = "Search places or addresses",
  focusSignal = 0,
  clearOnPick = false,
  onFocusChange,
  onAdminCode,
}: {
  theme: T;
  near?: { lat: number; lon: number };
  onSelect: (place: Place) => void;
  onClear: () => void;
  placeholder?: string;
  /** Change this number to focus the field (e.g. "Set Home"). */
  focusSignal?: number;
  /** Empty the field after a pick instead of showing the place's name. */
  clearOnPick?: boolean;
  onFocusChange?: (focused: boolean) => void;
  /** Called instead of searching when an admin code is typed and submitted. */
  onAdminCode?: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const nearRef = useRef(near);
  nearRef.current = near;

  useEffect(() => {
    if (focusSignal) {
      setQuery("");
      inputRef.current?.focus();
    }
  }, [focusSignal]);

  useEffect(() => {
    const q = query.trim();
    // Admin codes are never sent to the geocoder.
    if (q.length < 3 || /^decam-admin/i.test(q)) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      searchPlaces(q, nearRef.current, ctrl.signal)
        .then((r) => {
          setResults(r);
          setError(r.length ? null : "No places found");
        })
        .catch((e) => {
          if (e?.name !== "AbortError") setError("Search is unavailable right now");
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const showList = focused && query.trim().length >= 3;
  const shadow = {
    shadowColor: theme.shadowColor,
    shadowOpacity: theme.isDark ? 0.4 : 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 6 },
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.pill, { backgroundColor: theme.control }, shadow]}>
        <SearchIcon color={theme.textSecondary} />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          onFocus={() => {
            setFocused(true);
            onFocusChange?.(true);
          }}
          onBlur={() => {
            setFocused(false);
            onFocusChange?.(false);
          }}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="never"
          keyboardAppearance={theme.isDark ? "dark" : "light"}
          selectionColor={theme.accent}
          style={[styles.input, { color: theme.text, fontFamily: fonts.regular }]}
          onSubmitEditing={() => {
            const q = query.trim();
            if (ADMIN_CODE.test(q) && onAdminCode) {
              setQuery("");
              Keyboard.dismiss();
              onAdminCode(q);
              return;
            }
            if (results[0]) pick(results[0]);
          }}
          accessibilityLabel={placeholder}
        />
        {loading ? <ActivityIndicator color={theme.textSecondary} style={{ marginRight: 8 }} /> : null}
        {query.length > 0 ? (
          <Pressable
            onPress={() => {
              setQuery("");
              setResults([]);
              onClear();
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
            style={[styles.clear, { backgroundColor: theme.closeBg }]}
          >
            <CloseIcon size={14} color={theme.text} />
          </Pressable>
        ) : null}
      </View>

      {showList && (results.length > 0 || error) ? (
        <View style={[styles.list, { backgroundColor: theme.control }, shadow]}>
          {error && results.length === 0 ? (
            <Txt style={{ color: theme.textSecondary, fontSize: 15, padding: 16 }}>{error}</Txt>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
              {results.map((r, i) => (
                <Pressable
                  key={r.id + i}
                  onPress={() => pick(r)}
                  style={({ pressed }) => [
                    styles.result,
                    {
                      backgroundColor: pressed ? theme.subtle : "transparent",
                      borderTopColor: theme.divider,
                      borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth * 2,
                    },
                  ]}
                >
                  <View style={[styles.resultIcon, { backgroundColor: theme.subtle }]}>
                    <PinIcon color={theme.accentIcon} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt weight="semibold" numberOfLines={1} style={{ color: theme.text, fontSize: 16 }}>
                      {r.name}
                    </Txt>
                    {r.subtitle ? (
                      <Txt numberOfLines={1} style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>
                        {r.subtitle}
                      </Txt>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );

  function pick(place: Place) {
    setQuery(clearOnPick ? "" : place.name);
    setResults([]);
    Keyboard.dismiss();
    inputRef.current?.blur();
    onSelect(place);
  }
}

const styles = StyleSheet.create({
  pill: {
    height: 52,
    borderRadius: 26,
    paddingLeft: 18,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  input: { flex: 1, fontSize: 16, height: "100%" },
  clear: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", marginRight: 3 },
  list: { borderRadius: 20, overflow: "hidden" },
  result: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  resultIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
