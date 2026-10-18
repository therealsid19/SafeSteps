import React, { useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";

import type { Box, Rect } from "../detection/vision";

/**
 * Draws detected objects and the "cane box" (the path straight ahead) over the
 * camera preview. The preview fills the screen like resizeMode "cover", so frame
 * pixels are scaled up and centred the same way.
 */
export function DetectionOverlay({ frame, path, dist, boxes, highlight }: {
  frame: { w: number; h: number }; // the picture's size, in the same units as path and boxes
  path: Rect;
  dist: number;
  boxes: Box[];
  highlight?: string;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const { w: fw, h: fh } = frame;
  const scale = Math.max(size.w / fw, size.h / fh);
  const ox = (size.w - fw * scale) / 2;
  const oy = (size.h - fh * scale) / 2;
  const rect = (x1: number, y1: number, x2: number, y2: number) => ({
    left: ox + x1 * scale,
    top: oy + y1 * scale,
    width: (x2 - x1) * scale,
    height: (y2 - y1) * scale,
  });

  const [bx1, by1, bx2, by2] = path;
  const pathColor = dist < 1 ? "#FF8A6E" : dist < 3 ? "#F2C14F" : "#9FE0B4";

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {size.w > 0 && (
        <>
          <View style={[styles.path, { borderColor: pathColor }, rect(bx1, by1, bx2, by2)]} />
          {boxes.map(([x1, y1, x2, y2, name], i) =>
            name === null ? null : (
              <View
                key={i}
                style={[
                  styles.box,
                  name === highlight && styles.highlight,
                  rect(x1, y1, x2, y2),
                ]}
              >
                <Text style={[styles.label, name === highlight && styles.highlightLabel]}>
                  {name}
                </Text>
              </View>
            ),
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  path: { position: "absolute", borderWidth: 3, borderRadius: 12, borderStyle: "dashed" },
  box: { position: "absolute", borderWidth: 2, borderColor: "#F4EFEA", borderRadius: 6 },
  highlight: { borderColor: "#F2704F", borderWidth: 4 },
  label: {
    alignSelf: "flex-start",
    backgroundColor: "#F4EFEA",
    color: "#1C1B1F",
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderBottomRightRadius: 6,
  },
  highlightLabel: { backgroundColor: "#F2704F" },
});
