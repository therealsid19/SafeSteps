// Camera -> AI -> voice loop. The phone version of the detect repo's src/main.ts.
import { useEffect, useRef, useState, type RefObject } from "react";
import type { CameraView } from "expo-camera";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { DeviceMotion } from "expo-sensors";
import * as Speech from "expo-speech";
import { decode as decodeJpeg } from "jpeg-js";

import * as config from "./config";
import { loadModels, look, type Frame } from "./detector";
import { Announcer } from "./rules";
import { crop, median, type Box, type Info } from "./vision";

export type DetectionMode = "guide" | "find";
export type DetectionStatus = "idle" | "loading" | "running" | "error";

/** Words the detector knows, for the Find mode. */
export const FINDABLE = config.CLASSES;

/** Grab the current camera view as a small RGBA frame. */
async function grabFrame(camera: CameraView): Promise<Frame> {
  const picture = await camera.takePictureAsync({ pictureRef: true, shutterSound: false });
  const context = ImageManipulator.manipulate(picture).resize({ width: config.FRAME_W, height: null });
  const image = await context.renderAsync();
  const jpeg = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true });
  picture.release();
  context.release();
  image.release();

  const binary = atob(jpeg.base64!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const { data, width, height } = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true });
  return { data, w: width, h: height };
}

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
 */
export function useDetection(
  cameraRef: RefObject<CameraView | null>,
  { enabled, mode, target }: { enabled: boolean; mode: DetectionMode; target: string },
) {
  const [status, setStatus] = useState<DetectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [said, setSaid] = useState<{ text: string; key: string } | null>(null);
  const [fps, setFps] = useState(0);

  // the loop reads these without restarting
  const modeRef = useRef(mode);
  const targetRef = useRef(target);
  useEffect(() => {
    modeRef.current = mode;
    targetRef.current = target;
  }, [mode, target]);

  // phone tilt -> camera tilt for the height math (portrait: beta = 90° when upright)
  useEffect(() => {
    if (!enabled) return;
    DeviceMotion.setUpdateInterval(200);
    const sub = DeviceMotion.addListener(({ rotation }) => {
      if (rotation) config.cam.tilt = 90 - (rotation.beta * 180) / Math.PI;
    });
    return () => sub.remove();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    let running = true;
    let speaking = false;
    const announcer = new Announcer();
    const lastFind = { text: "", time: 0 };

    const say = (text: string, interrupt: boolean) => {
      if (interrupt) Speech.stop();
      speaking = true;
      const done = () => {
        speaking = false;
      };
      Speech.speak(text, { onDone: done, onStopped: done, onError: done });
      setSaid({ text, key: `${modeRef.current}|${targetRef.current}` });
    };

    async function loop() {
      setStatus("loading");
      setError(null);
      try {
        await loadModels();
      } catch (e) {
        if (!running) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : "Could not load the detection models.");
        return;
      }

      let prev = performance.now();
      while (running) {
        const camera = cameraRef.current;
        if (!camera) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }

        let result: Info;
        try {
          result = await look(await grabFrame(camera));
        } catch (e) {
          console.warn("Detection frame failed", e);
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        if (!running) break;

        const now = performance.now();
        if (modeRef.current === "guide") {
          const [text, interrupt] = announcer.decide(
            result.dist, now / 1000, speaking, result.label, result.left, result.right);
          if (text) say(text, interrupt);
        } else {
          const found = describeTarget(result, targetRef.current);
          if (found && !speaking) {
            const text = `${capitalize(targetRef.current)} ${found.where}, ${found.dist} meters.`;
            if (text !== lastFind.text || now - lastFind.time >= config.REPEAT_EVERY * 1000) {
              lastFind.text = text;
              lastFind.time = now;
              say(text, false);
            }
          }
        }

        setInfo(result);
        setFps(1000 / (now - prev));
        setStatus("running");
        prev = now;
      }
    }

    loop();
    return () => {
      running = false;
      Speech.stop();
    };
  }, [enabled, cameraRef]);

  // only show what was said for the current mode / target
  const message = said?.key === `${mode}|${target}` ? said.text : null;
  return { status: enabled ? status : "idle", error, info, message, fps };
}
