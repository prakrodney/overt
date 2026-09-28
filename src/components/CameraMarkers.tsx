import { memo } from "react";
import { View } from "react-native";
import { Marker, Polygon } from "react-native-maps";
import { isRedLight, isSpeedCamera, type CameraCluster, type CameraPoint } from "../lib/cameras";
import { conePolygon, metersPerPoint } from "../lib/geo";
import type { Theme } from "../theme";
import { CameraGlyph, SpeedGlyph, TrafficLightGlyph } from "./Icons";

type T = Theme & { isDark: boolean };

/** Slate camera marker. Solid = verified/community, dashed + faded = needs confirmation. */
export const CameraMarker = memo(function CameraMarker({
  point,
  selected,
  theme,
  onPress,
}: {
  point: CameraPoint;
  selected: boolean;
  theme: T;
  onPress: (p: CameraPoint) => void;
}) {
  const muted = point.confidence_level === "needs_confirmation";
  const speed = isSpeedCamera(point);
  const red = isRedLight(point);
  const fill = red ? theme.redLightFill : speed ? theme.speedFill : theme.markerFill;
  const stroke = speed || red ? theme.speedStroke : theme.markerStroke;
  const glyph = red ? theme.redLightGlyph : speed ? theme.speedGlyph : theme.markerGlyph;
  const r = selected ? 16 : 11;
  const halo = selected ? 26 : 0;
  const box = Math.max(r, halo) * 2 + 4;
  return (
    <Marker
      key={`${point.id}-${selected ? "s" : "n"}-${theme.isDark ? "d" : "l"}`}
      coordinate={{ latitude: point.lat, longitude: point.lon }}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={(e) => {
        e.stopPropagation();
        onPress(point);
      }}
      tracksViewChanges={false}
      zIndex={selected ? 1000 : 10}
      accessibilityLabel={red ? "Red-light camera" : speed ? "Speed camera" : "Automated license plate reader"}
    >
      <View style={{ width: box, height: box, alignItems: "center", justifyContent: "center" }}>
        {selected && (
          <View
            style={{
              position: "absolute",
              width: halo * 2,
              height: halo * 2,
              borderRadius: halo,
              backgroundColor: theme.selectHalo,
            }}
          />
        )}
        <View
          style={{
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            backgroundColor: muted ? theme.markerMutedFill : fill,
            borderWidth: selected ? 3 : muted ? 1.5 : 2,
            borderColor: muted ? (red ? theme.redLightFill : speed ? theme.speedFill : theme.markerMutedStroke) : stroke,
            borderStyle: muted ? "dashed" : "solid",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: theme.shadowColor,
            shadowOpacity: 0.25,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
          }}
        >
          {red ? (
            <TrafficLightGlyph size={selected ? 18 : 13} color={muted ? theme.redLightFill : glyph} />
          ) : speed ? (
            <SpeedGlyph size={selected ? 18 : 13} color={muted ? theme.speedFill : glyph} />
          ) : (
            <CameraGlyph size={selected ? 15 : 11} color={muted ? theme.markerMutedStroke : glyph} />
          )}
        </View>
      </View>
    </Marker>
  );
});

/** Numbered cluster bubble; grows a little with the count. */
export const ClusterMarker = memo(function ClusterMarker({
  cluster,
  theme,
  onPress,
}: {
  cluster: CameraCluster;
  theme: T;
  onPress: (c: CameraCluster) => void;
}) {
  const n = cluster.count;
  // A small, quiet dot: bigger where there are more cameras, no numbers.
  const d = n < 10 ? 10 : n < 100 ? 13 : n < 1000 ? 16 : 20;
  return (
    <Marker
      key={`${cluster.id}-${n}-${theme.isDark ? "d" : "l"}`}
      coordinate={{ latitude: cluster.lat, longitude: cluster.lon }}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={(e) => {
        e.stopPropagation();
        onPress(cluster);
      }}
      tracksViewChanges={false}
      zIndex={5}
      accessibilityLabel={`${n} ${isRedLight(cluster) ? "red-light cameras" : isSpeedCamera(cluster) ? "speed cameras" : "license plate readers"}. Tap to zoom in.`}
    >
      {/* Invisible padding keeps the tap target comfortable. */}
      <View style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
        <View
          style={{
            width: d,
            height: d,
            borderRadius: d / 2,
            backgroundColor: isRedLight(cluster)
              ? theme.redLightClusterFill
              : isSpeedCamera(cluster)
                ? theme.speedClusterFill
                : theme.clusterFill,
            borderWidth: 1.5,
            borderColor: theme.clusterStroke,
          }}
        />
      </View>
    </Marker>
  );
});

/**
 * Red view cones, drawn in map space so they stay pointed the right way when
 * the map rotates. Radius is ~36 pt on screen (76 pt for the selected camera).
 */
export function DirectionCones({
  points,
  selectedId,
  zoom,
  theme,
}: {
  points: CameraPoint[];
  selectedId: number | null;
  zoom: number;
  theme: T;
}) {
  return (
    <>
      {points.flatMap((p) =>
        p.directions.map((deg, i) => {
          const selected = p.id === selectedId;
          const speed = isSpeedCamera(p);
          const radius = (selected ? 76 : 36) * metersPerPoint(zoom, p.lat);
          return (
            <Polygon
              key={`${p.id}-${i}-${selected ? "s" : "n"}-${Math.round(radius)}-${theme.isDark ? "d" : "l"}`}
              coordinates={conePolygon(p.lat, p.lon, deg, radius)}
              fillColor={speed ? theme.speedCone : theme.cone}
              strokeColor={selected ? (speed ? theme.speedConeStroke : theme.coneStroke) : "transparent"}
              strokeWidth={selected ? 1.5 : 0}
              zIndex={1}
              tappable={false}
            />
          );
        })
      )}
    </>
  );
}
