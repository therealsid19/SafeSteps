// Runs the two ONNX models on-device. Port of the detect repo's src/camera.ts
// (onnxruntime-node -> onnxruntime-react-native, ffmpeg frames -> camera snapshots).
import { Asset } from "expo-asset";
import { InferenceSession, Tensor } from "onnxruntime-react-native";

import * as config from "./config";
import { analyze, readBoxes, type Grid, type Info, type Rect } from "./vision";

/** An RGBA frame. */
export interface Frame {
  data: Uint8Array;
  w: number;
  h: number;
}

const NAMES = config.CLASSES;

const DET_CONF = 0.25; // ultralytics' default predict threshold (MIN_CONF decides what gets a name)
const DET_IOU = 0.7;
const MAX_DET = 300;

async function loadModel(module: number) {
  const [asset] = await Asset.loadAsync(module);
  const uri = asset?.localUri;
  if (!uri) throw new Error("Could not load the detection model.");
  return InferenceSession.create(uri.replace(/^file:\/\//, ""));
}

let models: Promise<{ depthModel: InferenceSession; detector: InferenceSession }> | null = null;

/** Load both models once; later calls reuse them. */
export function loadModels() {
  models ??= Promise.all([
    loadModel(require("../../assets/models/depth.onnx")),
    loadModel(require("../../assets/models/yoloe.onnx")),
  ]).then(([depthModel, detector]) => ({ depthModel, detector }));
  models.catch(() => (models = null)); // allow a retry
  return models;
}

/** Sample `src` (RGBA) into a 1x3xSxS float tensor: dst pixel (x, y) reads src at (x*sx + ox, y*sy + oy).
 *  Pixels that land outside the frame get the letterbox gray (114). */
function toTensor(src: Frame, sx: number, sy: number, ox: number, oy: number): Tensor {
  const S = config.IMG_SIZE;
  const out = new Float32Array(3 * S * S);
  for (let y = 0; y < S; y++) {
    const fy = (y + 0.5) * sy + oy - 0.5; // pixel centres, like cv2.resize
    for (let x = 0; x < S; x++) {
      const fx = (x + 0.5) * sx + ox - 0.5;
      const i = y * S + x;
      if (fx < -0.5 || fy < -0.5 || fx > src.w - 0.5 || fy > src.h - 0.5) {
        out[i] = out[S * S + i] = out[2 * S * S + i] = 114 / 255;
        continue;
      }
      const x0 = Math.max(0, Math.floor(fx)), y0 = Math.max(0, Math.floor(fy));
      const x1 = Math.min(src.w - 1, x0 + 1), y1 = Math.min(src.h - 1, y0 + 1);
      const ax = Math.min(1, Math.max(0, fx - x0)), ay = Math.min(1, Math.max(0, fy - y0));
      for (let c = 0; c < 3; c++) {
        const p = (yy: number, xx: number) => src.data[(yy * src.w + xx) * 4 + c]!;
        const top = p(y0, x0) * (1 - ax) + p(y0, x1) * ax;
        const bot = p(y1, x0) * (1 - ax) + p(y1, x1) * ax;
        out[c * S * S + i] = (top * (1 - ay) + bot * ay) / 255;
      }
    }
  }
  return new Tensor("float32", out, [1, 3, S, S]);
}

/** Depth model: frame stretched to SxS, output upsampled back (align_corners) and scaled to metres. */
async function runDepth(depthModel: InferenceSession, frame: Frame): Promise<Grid> {
  const S = config.IMG_SIZE;
  const input = toTensor(frame, frame.w / S, frame.h / S, 0, 0);
  const result = await depthModel.run({ [depthModel.inputNames[0]!]: input });
  const raw = result[depthModel.outputNames[0]!]!.data as Float32Array; // 1x1xSxS

  const { w, h } = frame;
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = h > 1 ? (y * (S - 1)) / (h - 1) : 0;
    const y0 = Math.floor(fy), y1 = Math.min(S - 1, y0 + 1), ay = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = w > 1 ? (x * (S - 1)) / (w - 1) : 0;
      const x0 = Math.floor(fx), x1 = Math.min(S - 1, x0 + 1), ax = fx - x0;
      const top = raw[y0 * S + x0]! * (1 - ax) + raw[y0 * S + x1]! * ax;
      const bot = raw[y1 * S + x0]! * (1 - ax) + raw[y1 * S + x1]! * ax;
      data[y * w + x] = (top * (1 - ay) + bot * ay) * config.SCALE;
    }
  }
  return { data, w, h };
}

function iou(a: Rect, b: Rect) {
  const iw = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const ih = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = iw * ih;
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return union > 0 ? inter / union : 0;
}

/** Detector: frame letterboxed into SxS, output (1, 4 + classes + extra, anchors) -> boxes in frame pixels. */
async function runDetector(detector: InferenceSession, frame: Frame) {
  const S = config.IMG_SIZE;
  const r = Math.min(S / frame.w, S / frame.h);
  const padX = Math.round((S - Math.round(frame.w * r)) / 2 - 0.1);
  const padY = Math.round((S - Math.round(frame.h * r)) / 2 - 0.1);
  const input = toTensor(frame, 1 / r, 1 / r, -padX / r, -padY / r);

  const result = await detector.run({ [detector.inputNames[0]!]: input });
  const out = result[detector.outputNames[0]!]!;
  const [, rows, n] = out.dims as number[];
  const pred = out.data as Float32Array;
  const at = (row: number, j: number) => pred[row * n! + j]!;

  // best class per anchor, then class-aware NMS
  const found: { box: Rect; cls: number; conf: number }[] = [];
  for (let j = 0; j < n!; j++) {
    let cls = 0, conf = -1;
    for (let c = 0; c < NAMES.length && 4 + c < rows!; c++) {
      if (at(4 + c, j) > conf) { conf = at(4 + c, j); cls = c; }
    }
    if (conf <= DET_CONF) continue;
    const cx = at(0, j), cy = at(1, j), bw = at(2, j), bh = at(3, j);
    found.push({ box: [cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2], cls, conf });
  }
  found.sort((a, b) => b.conf - a.conf);
  const kept: typeof found = [];
  for (const d of found) {
    if (kept.length >= MAX_DET) break;
    if (kept.every((k) => k.cls !== d.cls || iou(k.box, d.box) <= DET_IOU)) kept.push(d);
  }

  // back to frame pixels
  const clip = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  for (const d of kept) {
    const [x1, y1, x2, y2] = d.box;
    d.box = [clip((x1 - padX) / r, frame.w), clip((y1 - padY) / r, frame.h),
      clip((x2 - padX) / r, frame.w), clip((y2 - padY) / r, frame.h)];
  }
  return kept;
}

/** Run both AI models on one frame. Returns everything the app needs. */
export async function look(frame: Frame): Promise<Info> {
  const { depthModel, detector } = await loadModels();
  const [depth, found] = await Promise.all([runDepth(depthModel, frame), runDetector(detector, frame)]);
  return analyze(depth, readBoxes(found, NAMES));
}
