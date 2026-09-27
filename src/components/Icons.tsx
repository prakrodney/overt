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

// ---- Category icons (stroke style, 24 grid) --------------------------------
const sp = (size: number, color: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: color,
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function FuelIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg {...sp(size, color)}>
      <Rect x={4} y={4} width={10} height={16} rx={1.5} />
      <Path d="M4 11h10" />
      <Path d="M14 8h2.5l2.5 3v6.5a1.5 1.5 0 0 1-3 0V14h-2" />
    </Svg>
  );
}

export function BurgerIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg {...sp(size, color)}>
      <Path d="M4 10a8 5 0 0 1 16 0z" />
      <Path d="M3.5 13.5h17" />
      <Path d="M4.5 17h15v.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" />
    </Svg>
  );
}

export function ForkKnifeIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg {...sp(size, color)}>
      <Path d="M7 3v7a2 2 0 0 0 2 2v9" />
      <Path d="M11 3v7a2 2 0 0 1-2 2" />
      <Path d="M17 21V3c-2 1-3 3.5-3 7h3" />
    </Svg>
  );
}

export function CartIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg {...sp(size, color)}>
      <Path d="M3 4h2.5l2 11h10l2-8H6.5" />
      <Circle cx={9} cy={19.5} r={1.3} />
      <Circle cx={17} cy={19.5} r={1.3} />
    </Svg>
  );
}

export function CupIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg {...sp(size, color)}>
      <Path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" />
      <Path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16" />
      <Path d="M9 3.5v2M12.5 3.5v2" />
    </Svg>
  );
}

export function PlugIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg {...sp(size, color)}>
      <Path d="M13 3l-6 10h5l-1 8 6-10h-5z" />
    </Svg>
  );
}

export function ParkingIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg {...sp(size, color)}>
      <Rect x={4} y={4} width={16} height={16} rx={3} />
      <Path d="M10 16.5v-9h3a2.5 2.5 0 0 1 0 5h-3" />
    </Svg>
  );
}

export function PharmacyIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg {...sp(size, color)}>
      <Path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" />
    </Svg>
  );
}

export function GearIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  );
}
