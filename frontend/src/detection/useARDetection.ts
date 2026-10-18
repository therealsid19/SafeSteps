// LiDAR iPhones: the native ARKit module (modules/safestep-ar) measures everything; this hook
// only turns its results into speech, like useDetection does for the camera + AI pipeline.
import { useCallback, useEffect, useRef, useState } from "react";
import type { NativeSyntheticEvent } from "react-native";
import * as Speech from "expo-speech";

import type { ARObject, HazardEvent, SafeStepARViewProps } from "../../modules/safestep-ar";
import * as config from "./config";
import { Announcer } from "./rules";
import { caneBox, type Box, type Rect } from "./vision";
import type { DetectionMode, DetectionStatus } from "./useDetection";

/** What DetectionOverlay draws. The AR picture is 3:4 portrait; boxes use a 300 x 400 frame. */
export interface Overlay {
  frame: { w: number; h: number };
  path: Rect;
  dist: number;
  boxes: Box[];
}
const FRAME = { w: 300, h: 400 };
const PATH = caneBox(FRAME.w, FRAME.h);

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const orNull = (s: string) => (s === "" ? null : s);

/** Find mode: where is the closest `target`, as a sentence. Null if it isn't in view. */
function describeTarget(objects: ARObject[], target: string): string | null {
  const matches = objects.filter((o) => o.name === target);
  if (matches.length === 0) return null;
  const best = matches.reduce((a, b) => ((b.dist ?? 99) < (a.dist ?? 99) ? b : a));
  let where: string;
  if (best.lateral !== undefined) {
    where = best.lateral < -0.5 ? "on your left" : best.lateral > 0.5 ? "on your right" : "ahead";
  } else {
    const cx = (best.x1 + best.x2) / 2; // no LiDAR reading there: use where it is in the picture
    where = cx < 1 / 3 ? "on your left" : cx > 2 / 3 ? "on your right" : "ahead";
  }
  const name = capitalize(target);
  return best.dist === undefined ? `${name} ${where}.` : `${name} ${where}, ${Math.round(best.dist * 2) / 2} meters.`;
}

export function useARDetection({ enabled, mode, target }: { enabled: boolean; mode: DetectionMode; target: string }) {
  const [started, setStarted] = useState(false); // first hazard result arrived
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [said, setSaid] = useState<{ text: string; key: string } | null>(null);

  const modeRef = useRef(mode);
  const targetRef = useRef(target);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    modeRef.current = mode;
    targetRef.current = target;
    enabledRef.current = enabled;
  }, [mode, target, enabled]);

  const speaking = useRef(false);
  const announcer = useRef(new Announcer());
  const lastFind = useRef({ text: "", time: 0 });
  const dropStreak = useRef(0);
  const boxes = useRef<Box[]>([]);
  const lastLog = useRef(0);

  // fresh start whenever detection is switched on; stop talking when switched off
  useEffect(() => {
    if (!enabled) return;
    announcer.current = new Announcer();
    lastFind.current = { text: "", time: 0 };
    dropStreak.current = 0;
    return () => {
      Speech.stop();
    };
  }, [enabled]);

  const say = useCallback((text: string, interrupt: boolean) => {
    if (interrupt) Speech.stop();
    speaking.current = true;
    const done = () => {
      speaking.current = false;
    };
    Speech.speak(text, { rate: config.SPEECH_RATE, onDone: done, onStopped: done, onError: done });
    setSaid({ text, key: `${modeRef.current}|${targetRef.current}` });
  }, []);

  const onHazard = useCallback(
    ({ nativeEvent: h }: NativeSyntheticEvent<HazardEvent>) => {
      setStarted(true);
      // a drop-off only counts once several checks in a row agree
      dropStreak.current = h.drop >= 0 ? dropStreak.current + 1 : 0;
      const dropped = dropStreak.current >= config.DROP_FRAMES;
      const dist = dropped ? h.drop : h.dist;
      const label = dropped ? "drop-off" : orNull(h.label);

      const now = performance.now();
      if (now - lastLog.current > 1000) { // TODO: remove once tuned
        lastLog.current = now;
        console.log(
          `AR | phone ${h.phoneHeight.toFixed(2)} m up (${h.floorFound ? "floor found" : "floor estimated"}) | ` +
            `tracking ${h.tracking} | ${label ?? "object"} ${dist >= 99 ? "clear" : `${dist.toFixed(2)} m`} | ` +
            `left ${h.left || "-"} right ${h.right || "-"} | drop ${h.drop >= 0 ? h.drop.toFixed(2) : "-"} x${dropStreak.current} | ` +
            `hazard ${h.ms.toFixed(1)}ms detector ${h.detectorMs.toFixed(0)}ms`,
        );
      }
      if (!enabledRef.current) return;

      setOverlay({ frame: FRAME, path: PATH, dist, boxes: boxes.current });
      if (modeRef.current === "guide") {
        const [text, interrupt] = announcer.current.decide(
          dist, now / 1000, speaking.current, label, orNull(h.left), orNull(h.right));
        if (text) say(text, interrupt);
      }
    },
    [say],
  );

  const onObjects = useCallback(
    ({ nativeEvent: { objects } }: NativeSyntheticEvent<{ objects: ARObject[]; ms: number }>) => {
      boxes.current = objects.map((o) => [o.x1 * FRAME.w, o.y1 * FRAME.h, o.x2 * FRAME.w, o.y2 * FRAME.h, o.name]);
      if (!enabledRef.current || modeRef.current !== "find" || speaking.current) return;
      const text = describeTarget(objects, targetRef.current);
      const now = performance.now();
      const last = lastFind.current;
      if (text && (text !== last.text || now - last.time >= config.REPEAT_EVERY * 1000)) {
        lastFind.current = { text, time: now };
        say(text, false);
      }
    },
    [say],
  );

  const onStatus = useCallback(({ nativeEvent }: NativeSyntheticEvent<{ message: string; error?: boolean }>) => {
    console.log(nativeEvent.message);
    if (nativeEvent.error) setError(nativeEvent.message);
  }, []);

  const handlers: Pick<SafeStepARViewProps, "onHazard" | "onObjects" | "onStatus"> = { onHazard, onObjects, onStatus };
  const message = said?.key === `${mode}|${target}` ? said.text : null;
  const status: DetectionStatus = !enabled ? "idle" : error ? "error" : started ? "running" : "loading";
  return { handlers, status, error, overlay: enabled ? overlay : null, message };
}
