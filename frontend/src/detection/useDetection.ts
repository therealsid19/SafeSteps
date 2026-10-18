// Camera -> AI -> voice loop. The phone version of the detect repo's main.py.
// Frames come straight from VisionCamera; the GPU resizer turns each one into the model's
// 320x320 input, so there are no photos, JPEGs or pixel loops in JavaScript anymore.
import { useCallback, useEffect, useRef, useState } from "react";
import { DeviceMotion } from "expo-sensors";
import * as Speech from "expo-speech";
import { CommonResolutions, useFrameOutput } from "react-native-vision-camera";
import { useResizer, type GPUFrame } from "react-native-vision-camera-resizer";
import { scheduleOnRN } from "react-native-worklets";

import * as config from "./config";
import { loadModels, look } from "./detector";
import { Announcer } from "./rules";
import { crop, median, type Box, type Info } from "./vision";

export type DetectionMode = "guide" | "find";
export type DetectionStatus = "idle" | "loading" | "running" | "error";

/** Words the detector knows, for the Find mode. */
export const FINDABLE = config.CLASSES;

/** Send at most one frame to the AI every this many ms (the AI can't keep up with 30 fps anyway). */
const FRAME_INTERVAL_MS = 100;

/** Find mode: where is the closest `target`, as a sentence. Null if it isn't in view. */
function describeTarget(info: Info, target: string): { where: string; dist: number } | null {
  let best: { box: Box; dist: number } | null = null;
  for (const box of info.boxes) {
    if (box[4] !== target) continue;
    const dist = median(crop(info.depth, box[0], box[1], box[2], box[3]).data);
    if (!best || dist < best.dist) best = { box, dist };
  }
  if (!best) return null;

  const cx = (best.box[0] + best.box[2]) / 2;
  const third = info.depth.w / 3;
  const where = cx < third ? "on your left" : cx > 2 * third ? "on your right" : "ahead";
  return { where, dist: Math.round(best.dist * 2) / 2 };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Runs object + obstacle detection on the camera while `enabled`.
 * guide: speaks obstacle warnings (what's ahead, walls, drop-offs).
 * find:  speaks where `target` is whenever it's in view.
 *
 * Returns `frameOutput`: pass it to <Camera outputs={[frameOutput]} />.
 */
export function useDetection({ enabled, mode, target }: { enabled: boolean; mode: DetectionMode; target: string }) {
  // model loading: only changed inside the loadModels() callbacks below
  const [models, setModels] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [said, setSaid] = useState<{ text: string; key: string } | null>(null);
  const [fps, setFps] = useState(0);

  // the frame handler reads these without being recreated
  const modeRef = useRef(mode);
  const targetRef = useRef(target);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    modeRef.current = mode;
    targetRef.current = target;
    enabledRef.current = enabled;
  }, [mode, target, enabled]);

  // per-session state (reset whenever detection is switched on)
  const busy = useRef(false); // true while the AI is working on a frame -> newer frames are skipped
  const ready = useRef(false); // models loaded
  const speaking = useRef(false);
  const announcer = useRef(new Announcer());
  const lastFind = useRef({ text: "", time: 0 });
  const prev = useRef(0);

  // phone tilt -> camera tilt for the height math (portrait: beta = 90° when upright)
  useEffect(() => {
    if (!enabled) return;
    DeviceMotion.setUpdateInterval(200);
    const sub = DeviceMotion.addListener(({ rotation }) => {
      if (rotation) config.cam.tilt = 90 - (rotation.beta * 180) / Math.PI;
    });
    return () => sub.remove();
  }, [enabled]);

  // load the models when switched on; stop talking when switched off
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    announcer.current = new Announcer();
    lastFind.current = { text: "", time: 0 };
    ready.current = false;
    loadModels()
      .then(() => {
        if (!alive) return;
        ready.current = true;
        setModels("ready");
        setError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setModels("error");
        setError(e instanceof Error ? e.message : "Could not load the detection models.");
      });
    return () => {
      alive = false;
      ready.current = false;
      Speech.stop();
    };
  }, [enabled]);

  const say = useCallback((text: string, interrupt: boolean) => {
    if (interrupt) Speech.stop();
    speaking.current = true;
    const done = () => {
      speaking.current = false;
    };
    Speech.speak(text, { onDone: done, onStopped: done, onError: done });
    setSaid({ text, key: `${modeRef.current}|${targetRef.current}` });
  }, []);

  /** Runs on the normal JS thread for each frame the worklet sends over. */
  const onPixels = useCallback(
    async (pixels: Uint8Array, frameW: number, frameH: number) => {
      if (!enabledRef.current || !ready.current || busy.current) return; // AI still busy: skip this frame
      busy.current = true;
      try {
        const result = await look(pixels, frameW, frameH);
        if (!enabledRef.current) return;

        const now = performance.now();
        if (modeRef.current === "guide") {
          const [text, interrupt] = announcer.current.decide(
            result.dist, now / 1000, speaking.current, result.label, result.left, result.right);
          if (text) say(text, interrupt);
        } else {
          const found = describeTarget(result, targetRef.current);
          if (found && !speaking.current) {
            const text = `${capitalize(targetRef.current)} ${found.where}, ${found.dist} meters.`;
            const last = lastFind.current;
            if (text !== last.text || now - last.time >= config.REPEAT_EVERY * 1000) {
              lastFind.current = { text, time: now };
              say(text, false);
            }
          }
        }

        setInfo(result);
        if (prev.current) setFps(1000 / (now - prev.current));
        prev.current = now;
      } catch (e) {
        console.warn("Detection frame failed", e);
      } finally {
        busy.current = false;
      }
    },
    [say],
  );

  // GPU resize: camera frame -> 320x320 RGB, planar, letterboxed (bars on the sides, no stretching)
  const { resizer } = useResizer({
    width: config.IMG_SIZE,
    height: config.IMG_SIZE,
    channelOrder: "rgb",
    dataType: "uint8", // 4x smaller to send to JS than float32; turned into 0..1 floats in detector.ts
    pixelLayout: "planar",
    scaleMode: "contain",
  });

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_4_3, // small 4:3 frames: full camera view, cheap to resize
    pixelFormat: "yuv", // the resizer converts to RGB itself
    enablePhysicalBufferRotation: false, // the resizer rotates on the GPU
    dropFramesWhileBusy: true,
    onFrame(frame) {
      "worklet";
      // send at most one frame every FRAME_INTERVAL_MS (the worklet runtime keeps globalThis between frames)
      const g = globalThis as unknown as { __ssLastSend?: number };
      const now = Date.now();
      if (resizer == null || now - (g.__ssLastSend ?? 0) < FRAME_INTERVAL_MS) {
        frame.dispose();
        return;
      }
      g.__ssLastSend = now;

      let resized: GPUFrame | undefined;
      try {
        resized = resizer.resize(frame);
        const pixels = new Uint8Array(resized.getPixelBuffer().slice(0)); // copy: the GPU buffer is reused
        scheduleOnRN(onPixels, pixels, frame.width, frame.height);
      } catch {
        // ignore: the camera may be closing
      } finally {
        resized?.dispose();
        frame.dispose();
      }
    },
  });

  // only show what was said for the current mode / target
  const message = said?.key === `${mode}|${target}` ? said.text : null;
  // status is worked out from other state instead of being stored separately
  const status: DetectionStatus = !enabled ? "idle" : models === "ready" ? "running" : models;
  return { frameOutput, status, error, info, message, fps };
}