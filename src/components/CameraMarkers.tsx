import { memo } from "react";
import { View } from "react-native";
import { Marker, Polygon } from "react-native-maps";
import type { CameraCluster, CameraPoint } from "../lib/cameras";
import { conePolygon, metersPerPoint } from "../lib/geo";
import type { Theme } from "../theme";
import { CameraGlyph } from "./Icons";

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
      accessibilityLabel="Automated license plate reader"
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
            backgroundColor: muted ? theme.markerMutedFill : theme.markerFill,
            borderWidth: selected ? 3 : muted ? 1.5 : 2,
            borderColor: muted ? theme.markerMutedStroke : theme.markerStroke,
            borderStyle: muted ? "dashed" : "solid",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: theme.shadowColor,
            shadowOpacity: 0.25,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
          }}
        >
          <CameraGlyph size={selected ? 15 : 11} color={muted ? theme.markerMutedStroke : theme.markerGlyph} />
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
      accessibilityLabel={`${n} license plate readers. Tap to zoom in.`}
    >
      {/* Invisible padding keeps the tap target comfortable. */}
      <View style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
        <View
          style={{
            width: d,
            height: d,
            borderRadius: d / 2,
            backgroundColor: theme.clusterFill,
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
          const radius = (selected ? 76 : 36) * metersPerPoint(zoom, p.lat);
          return (
            <Polygon
              key={`${p.id}-${i}-${selected ? "s" : "n"}-${Math.round(radius)}-${theme.isDark ? "d" : "l"}`}
              coordinates={conePolygon(p.lat, p.lon, deg, radius)}
              fillColor={theme.cone}
              strokeColor={selected ? theme.coneStroke : "transparent"}
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
