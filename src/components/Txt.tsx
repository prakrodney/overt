import { Text, TextProps, TextStyle, StyleSheet } from "react-native";
import { fonts } from "../theme";

type Weight = "regular" | "medium" | "semibold" | "bold" | "extrabold";

/** Text in Figtree. Pick a weight instead of fontWeight (custom fonts need one file per weight). */
export function Txt({ weight = "regular", style, ...rest }: TextProps & { weight?: Weight }) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const { fontWeight: _ignored, ...clean } = flat ?? {};
  return <Text {...rest} style={[{ fontFamily: fonts[weight] }, clean]} />;
}
