// Camera -> AI -> voice loop. The phone version of the detect repo's main.py.
// Frames come straight from VisionCamera; the GPU resizer turns each one into the model's
// 320x320 input, so there are no photos, JPEGs or pixel loops in JavaScript anymore.
import { useCallback, useEffect, useRef, useState } from "react";
import { DeviceMotion } from "expo-sensors";
import * as Speech from "expo-speech";
import { CommonResolutions, useDepthOutput, useFrameOutput, type CameraOrientation, type Depth } from "react-native-vision-camera";
import { useResizer, type GPUFrame } from "react-native-vision-camera-resizer";
import { scheduleOnRN } from "react-native-worklets";

import * as config from "./config";
import { estimateDepth, fitTo, loadModels, look } from "./detector";
import { Announcer } from "./rules";
import { cameraHeight, crop, median, type Box, type Grid, type Info } from "./vision";

export type DetectionMode = "guide" | "find";
export type DetectionStatus = "idle" | "loading" | "running" | "error";

/** Words the detector knows, for the Find mode. */
export const FINDABLE = config.FINDABLE;

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

/** Pearson correlation of log-distances: how well two depth pictures agree on near vs far (1 = perfectly). */
function depthAgreement(a: Grid, b: Grid): number {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < a.data.length; i++) {
    const va = a.data[i]!, vb = b.data[i]!;
    if (!(va > 0 && va < config.LIDAR_NO_READING && vb > 0)) continue; // skip "no reading" pixels
    const x = Math.log(va), y = Math.log(vb);
    n++; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
  }
  if (n < 100) return 0;
  const cov = sab / n - (sa / n) * (sb / n);
  const va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
}

const TURNS: CameraOrientation[] = ["up", "right", "down", "left"];

/** LiDAR depth arrives in the sensor's own orientation. Turn it upright (portrait) and replace
 *  "no reading" pixels (0 / NaN: too far, or no laser return) with a far distance. */
function uprightDepth(raw: Float32Array, w: number, h: number, stride: number, orientation: CameraOrientation): Grid {
  const turned = orientation === "left" || orientation === "right";
  const uw = turned ? h : w, uh = turned ? w : h; // upright size
  const data = new Float32Array(uw * uh);
  for (let uy = 0; uy < uh; uy++) {
    for (let ux = 0; ux < uw; ux++) {
      // where this upright pixel sits in the raw (rotated) data
      let rx = ux, ry = uy;
      if (orientation === "right") { rx = uh - 1 - uy; ry = ux; } // raw = upright turned 90° clockwise
      else if (orientation === "left") { rx = uy; ry = uw - 1 - ux; } // raw = upright turned 90° counter-clockwise
      else if (orientation === "down") { rx = uw - 1 - ux; ry = uh - 1 - uy; }
      const v = raw[ry * stride + rx]!;
      data[uy * uw + ux] = v > 0 && Number.isFinite(v) ? v : config.LIDAR_NO_READING;
    }
  }
  return { data, w: uw, h: uh };
}

/**
 * Runs object + obstacle detection on the camera while `enabled`.
 * guide: speaks obstacle warnings (what's ahead, walls, drop-offs).
 * find:  speaks where `target` is whenever it's in view.
 *
 * Returns `frameOutput`: pass it to <Camera outputs={[frameOutput]} />.
 */
export function useDetection({
  enabled,
  mode,
  target,
  lidar = false,
}: {
  enabled: boolean;
  mode: DetectionMode;
  target: string;
  lidar?: boolean; // this camera has LiDAR: attach `depthOutput` to the <Camera> too
}) {
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
  const dropStreak = useRef(0); // how many frames in a row have seen a drop-off
  // newest LiDAR depth frame, still in the sensor's orientation (turned upright when used)
  // focal = the LiDAR's focal length in its own pixels (0 = no calibration data)
  const latestLidar = useRef<{ raw: Float32Array; w: number; h: number; stride: number; focal: number; reported: CameraOrientation; time: number } | null>(null);
  // which way the LiDAR picture must be turned. Found automatically on the first frames (see checkLidarTurn)
  const lidarTurn = useRef<CameraOrientation | null>(null);
  const turnTries = useRef(0);
  const lidarWhy = useRef<string | null | undefined>(undefined); // last reason logged for not using LiDAR
  const lidarRef = useRef(lidar);
  useEffect(() => {
    lidarRef.current = lidar;
  }, [lidar]);

  // phone tilt -> camera tilt for the height math (portrait: beta = 90° when upright)
  useEffect(() => {
    if (!enabled) return;
    DeviceMotion.setUpdateInterval(50); // fresh tilt: 200 ms old tilt = wrong heights while walking
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
    dropStreak.current = 0;
    config.cam.height = config.CAM_HEIGHT; // re-measured from the floor once LiDAR frames arrive
    config.cam.focal = 0;
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
    Speech.speak(text, { rate: config.SPEECH_RATE, onDone: done, onStopped: done, onError: done });
    setSaid({ text, key: `${modeRef.current}|${targetRef.current}` });
  }, []);

  /** Which way is the LiDAR picture turned? Try all 4 rotations and keep the one that best matches the
   *  AI depth model's view of the same scene. Runs on the first frames only, until it's sure. */
  const checkLidarTurn = useCallback(
    async (l: { raw: Float32Array; w: number; h: number; stride: number; reported: CameraOrientation },
      pixels: Uint8Array, frameW: number, frameH: number) => {
      const ai = await estimateDepth(pixels, frameW, frameH);
      const scores = TURNS.map((turn) => ({
        turn,
        score: depthAgreement(fitTo(uprightDepth(l.raw, l.w, l.h, l.stride, turn), ai.w, ai.h), ai),
      })).sort((a, b) => b.score - a.score);
      const [best, second] = scores;
      console.log(`LiDAR turn check: ${scores.map((x) => `${x.turn} ${x.score.toFixed(2)}`).join(" | ")}` +
        ` (sensor reported "${l.reported}")`);
      if (best!.score > 0.5 && best!.score - second!.score > 0.1) {
        lidarTurn.current = best!.turn; // sure enough: use LiDAR from now on
        console.log(`LiDAR turn: using "${best!.turn}"`);
      } else if (++turnTries.current >= config.LIDAR_TURN_TRIES) {
        // never sure (e.g. a blank wall): trust the sensor, instead of running the depth model on every frame forever
        lidarTurn.current = l.reported;
        console.log(`LiDAR turn: not sure after ${turnTries.current} tries, using reported "${l.reported}"`);
      }
    },
    [],
  );

  /** Runs on the normal JS thread for each frame the worklet sends over. */
  const onPixels = useCallback(
    async (pixels: Uint8Array, frameW: number, frameH: number) => {
      if (!enabledRef.current || !ready.current || busy.current) return; // AI still busy: skip this frame
      busy.current = true;
      try {
        // use LiDAR depth if we have a fresh frame (and know which way it's turned); else the AI depth model
        const l = latestLidar.current;
        const fresh = lidarRef.current && l && performance.now() - l.time < config.LIDAR_MAX_AGE_MS ? l : null;
        // debug: say (once per change) why LiDAR isn't being used
        const why = !lidarRef.current ? "this camera has no LiDAR"
          : !l ? "no LiDAR depth frames received yet"
          : !fresh ? `newest LiDAR frame is ${(performance.now() - l.time).toFixed(0)} ms old`
          : null;
        if (why?.split(" ")[0] !== lidarWhy.current?.split(" ")[0]) {
          console.log(why ? `LiDAR not used: ${why}` : "LiDAR frames arriving");
          lidarWhy.current = why;
        }
        if (fresh && !lidarTurn.current) await checkLidarTurn(fresh, pixels, frameW, frameH);
        const measured =
          fresh && lidarTurn.current
            ? uprightDepth(fresh.raw, fresh.w, fresh.h, fresh.stride, lidarTurn.current)
            : null;
        if (measured) {
          // the phone's real lens, and its real height above the floor (instead of the 1.2 m guess)
          config.cam.focal = fresh!.focal > 0 ? fresh!.focal / measured.h : 0;
          const floor = cameraHeight(measured);
          if (floor !== null) config.cam.height += config.CAM_HEIGHT_SMOOTH * (floor - config.cam.height);
        }
        const seen = await look(pixels, frameW, frameH, measured);
        if (!enabledRef.current) return;

        // a drop-off only counts once several frames in a row agree (one noisy frame shouldn't scare the user)
        dropStreak.current = seen.drop !== null ? dropStreak.current + 1 : 0;
        const result: Info =
          dropStreak.current >= config.DROP_FRAMES ? { ...seen, dist: seen.drop!, label: "drop-off" } : seen;

        // TODO: remove once calibrated. On a flat empty floor, floorNear/floorMid should be close to 0 m.
        console.log(
          `tilt ${config.cam.tilt.toFixed(0)}° | phone ${config.cam.height.toFixed(2)} m up | ${result.label ?? "object"} ${result.dist.toFixed(2)} m | ` +
            `floor near ${seen.floorNear.toFixed(2)} mid ${seen.floorMid.toFixed(2)} | drop ${seen.drop?.toFixed(2) ?? "-"} x${dropStreak.current}`,
        );

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
    [say, checkLidarTurn],
  );

  /** Runs on the JS thread for each LiDAR depth frame the worklet sends over: keep the newest one. */
  const onLidar = useCallback(
    (raw: Float32Array, w: number, h: number, stride: number, focal: number, orientation: CameraOrientation) => {
      if (!latestLidar.current) {
        console.log(`LiDAR depth: ${w}x${h}, focal ${focal.toFixed(1)} px, reported orientation "${orientation}"`); // once
      }
      latestLidar.current = { raw, w, h, stride, focal, reported: orientation, time: performance.now() };
    },
    [],
  );

  const logDepthFormat = useCallback((format: string, accuracy: string) => {
    console.log(`LiDAR not used: depth frames are "${format}" (accuracy "${accuracy}"), not real metres`);
  }, []);

  // LiDAR depth (iPhone Pro): real distances in metres, so no depth model and no SCALE guessing
  const depthOutput = useDepthOutput({
    enableFiltering: true, // fills small holes in the LiDAR data
    dropFramesWhileBusy: true,
    onDepth(depth) {
      "worklet";
      const g = globalThis as unknown as { __ssLastDepth?: number; __ssLoggedFormat?: boolean };
      const now = Date.now();
      // twice as often as camera frames, so the depth used with a frame is at most ~50 ms older than it
      if (now - (g.__ssLastDepth ?? 0) < FRAME_INTERVAL_MS / 2) {
        depth.dispose();
        return;
      }
      g.__ssLastDepth = now;

      let converted: Depth | undefined;
      try {
        // "disparity-*" = two-camera estimate, not metres: skip it and let the AI depth model run instead
        if (!depth.pixelFormat.startsWith("depth-")) {
          if (!g.__ssLoggedFormat) scheduleOnRN(logDepthFormat, depth.pixelFormat, depth.depthDataAccuracy);
          g.__ssLoggedFormat = true;
          return;
        }
        if (depth.pixelFormat !== "depth-32-bit") converted = depth.convert("depth-32-bit");
        const d = converted ?? depth;
        const raw = new Float32Array(d.getDepthData().slice(0)); // copy: the buffer is reused after dispose
        // the lens' real focal length, scaled from the calibration's reference size to this depth map
        let focal = 0;
        const cal = depth.cameraCalibrationData;
        if (cal && cal.intrinsicMatrixReferenceDimensions.width > 0) {
          focal = cal.cameraIntrinsicMatrix[0]! * (d.width / cal.intrinsicMatrixReferenceDimensions.width);
        }
        scheduleOnRN(onLidar, raw, d.width, d.height, d.bytesPerRow / 4, focal, d.orientation);
      } catch {
        // ignore: the camera may be closing
      } finally {
        converted?.dispose();
        depth.dispose();
      }
    },
  });

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
  return { frameOutput, depthOutput, status, error, info, message, fps };
}