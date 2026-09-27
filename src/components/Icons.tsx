import Svg, { Circle, Path, Rect } from "react-native-svg";

type P = { size?: number; color: string; strokeWidth?: number };

export function SearchIcon({ size = 20, color, strokeWidth = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Circle cx={11} cy={11} r={7} />
      <Path d="M20 20l-3.5-3.5" />
    </Svg>
  );
}

export function LocateIcon({ size = 22, color, strokeWidth = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Path d="M20 4L4 11l7 2 2 7 7-16z" />
    </Svg>
  );
}

export function CloseIcon({ size = 16, color, strokeWidth = 2.4 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function PinIcon({ size = 18, color, strokeWidth = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <Circle cx={12} cy={9.5} r={2.5} />
    </Svg>
  );
}

export function CheckIcon({ size = 14, color, strokeWidth = 2.6 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12l5 5 9-10" />
    </Svg>
  );
}

export function InfoIcon({ size = 14, color, strokeWidth = 2.4 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 11v5M12 8h.01" />
    </Svg>
  );
}

/** The camera glyph used inside markers (from the design's marker symbol). */
export function CameraGlyph({ size = 11, color }: { size?: number; color: string }) {
  // Drawn on the design's 11 × 7 grid, centred.
  return (
    <Svg width={size} height={(size * 7) / 11} viewBox="-5.5 -3.5 11 7">
      <Rect x={-5.5} y={-3.5} width={7} height={7} rx={1.5} fill={color} />
      <Path d="M1.5 -1.5 L5.5 -3.5 V3.5 L1.5 1.5 Z" fill={color} />
    </Svg>
  );
}

export function BackIcon({ size = 20, color, strokeWidth = 2.2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

export function DirectionsIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M20 4L4 11l7 2 2 7 7-16z" />
    </Svg>
  );
}

export function TollIcon({ size = 16, color, strokeWidth = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 20V5h16v15" />
      <Path d="M4 9h16" />
      <Path d="M12 12v5" />
    </Svg>
  );
}

export function WarnIcon({ size = 14, color, strokeWidth = 2.4 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 4l9 16H3z" />
      <Path d="M12 10v4" />
      <Path d="M12 17.5v.5" />
    </Svg>
  );
}

export function CameraFilledIcon({ size = 14, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Rect x={3} y={7} width={12} height={10} rx={2} />
      <Path d="M16 10.5l5-3v9l-5-3z" />
    </Svg>
  );
}

export function PlusIcon({ size = 20, color, strokeWidth = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function HomeIcon({ size = 22, color, strokeWidth = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Path d="M4 11l8-7 8 7v9H4z" />
    </Svg>
  );
}

export function WorkIcon({ size = 22, color, strokeWidth = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Rect x={4} y={7} width={16} height={13} rx={2} />
      <Path d="M9 7V4h6v3" />
    </Svg>
  );
}

export function ClockIcon({ size = 18, color, strokeWidth = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Circle cx={12} cy={12} r={8} />
      <Path d="M12 8v4l3 2" />
    </Svg>
  );
}

/** Speedometer glyph for speed cameras (same small grid as CameraGlyph). */
export function SpeedGlyph({ size = 12, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round">
      <Path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
      <Path d="M12 14l4-4.5" />
      <Circle cx={12} cy={14} r={1.2} fill={color} stroke="none" />
    </Svg>
  );
}

/** Police badge (shield with star). */
export function PoliceIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2.5l7.5 3v6c0 4.6-3.2 8.3-7.5 10-4.3-1.7-7.5-5.4-7.5-10v-6z" fill={color} />
      <Path
        d="M12 7.6l1.25 2.55 2.8.4-2.03 1.98.48 2.8L12 14l-2.5 1.33.48-2.8-2.03-1.98 2.8-.4z"
        fill="rgba(0,0,0,0.35)"
      />
    </Svg>
  );
}

/** Crash (car with an impact burst). */
export function CrashIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round">
      <Path d="M3 16v-3l2-4.5h8l2.5 4.5V16z" />
      <Circle cx={6.5} cy={16.5} r={1.6} fill={color} />
      <Circle cx={12.5} cy={16.5} r={1.6} fill={color} />
      <Path d="M18 4l.6 2.4L21 6l-1.4 2 1.9 1.4-2.5.2" />
    </Svg>
  );
}

/** Object on the road (warning triangle with !). */
export function HazardIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round">
      <Path d="M12 3.5l9.5 16.5h-19z" />
      <Path d="M12 10v4.5" />
      <Circle cx={12} cy={17.2} r={0.6} fill={color} />
    </Svg>
  );
}
