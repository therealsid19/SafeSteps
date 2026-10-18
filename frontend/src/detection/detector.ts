// Runs the two ONNX models on-device. Port of the detect repo's src/camera.ts.
// Input now comes from VisionCamera's GPU resizer: a ready-made 320x320 RGB picture
// (planar = all red, then all green, then all blue), letterboxed ("contain") with bars on the sides.
import { Platform } from "react-native";
import { Asset } from "expo-asset";
import { InferenceSession, Tensor } from "onnxruntime-react-native";

import * as config from "./config";
import { analyze, readBoxes, type Grid, type Info, type Rect } from "./vision";

const NAMES = config.CLASSES;

const DET_CONF = 0.25; // ultralytics' default predict threshold (MIN_CONF decides what gets a name)
const DET_IOU = 0.7;
const MAX_DET = 300;

/** Load one model. Uses the phone's AI hardware (CoreML / NNAPI) when it can, else the CPU. */
async function loadModel(module: number, label: string) {
  const [asset] = await Asset.loadAsync(module);
  const uri = asset?.localUri;
  if (!uri) throw new Error("Could not load the detection model.");
  const path = uri.replace(/^file:\/\//, "");

  // iOS: CoreML's newer "ML Program" format runs far more of YOLO / the depth model on the Neural Engine
  // (the old format leaves many layers on the CPU, and hopping between the two is slow)
  const tries: [string, InferenceSession.ExecutionProviderConfig[]][] = Platform.OS === "ios"
    ? [
      ["coreml (ML Program)", [{ name: "coreml", coreMlFlags: COREML_MLPROGRAM | COREML_STATIC_SHAPES }, "cpu"]],
      ["coreml", ["coreml", "cpu"]],
    ]
    : [["nnapi", ["nnapi", "cpu"]]];
  for (const [name, executionProviders] of tries) {
    try {
      const session = await InferenceSession.create(path, { executionProviders });
      console.log(`${label} model: ${name} (+cpu fallback)`);
      return session;
    } catch (e) {
      console.warn(`${label} model: ${name} not available`, e);
    }
  }
  console.warn(`${label} model: using cpu only`);
  return InferenceSession.create(path);
}

const COREML_STATIC_SHAPES = 0x008; // our inputs are always IMG_SIZE x IMG_SIZE
const COREML_MLPROGRAM = 0x010;

let models: Promise<{ depthModel: InferenceSession; detector: InferenceSession }> | null = null;

/** Load both models once; later calls reuse them. */
export function loadModels() {
  models ??= Promise.all([
    loadModel(require("../../assets/models/depth.onnx"), "depth"),
    // both files must exist in assets/models/ (Metro bundles every require)
    loadModel(
      config.USE_YOLOE ? require("../../assets/models/yoloe.onnx") : require("../../assets/models/yolo26n.onnx"),
      config.USE_YOLOE ? "detector (YOLOE)" : "detector (yolo26n)",
    ),
  ]).then(([depthModel, detector]) => ({ depthModel, detector }));
  models.catch(() => (models = null)); // allow a retry
  return models;
}

/** Where the real picture sits inside the SxS letterboxed input (the rest is bars). */
interface Content {
  padX: number;
  padY: number;
  w: number;
  h: number;
}

/** The resizer fits the camera frame inside SxS without stretching. Work out where it landed.
 *  The app is portrait-only, so the picture is taller than wide (short side = width). */
export function contentArea(frameW: number, frameH: number): Content {
  const S = config.IMG_SIZE;
  const fw = Math.min(frameW, frameH), fh = Math.max(frameW, frameH); // portrait
  const r = Math.min(S / fw, S / fh);
  const w = Math.round(fw * r), h = Math.round(fh * r);
  return { padX: Math.floor((S - w) / 2), padY: Math.floor((S - h) / 2), w, h };
}

const TO_FLOAT = Float32Array.from({ length: 256 }, (_, v) => v / 255); // byte -> 0..1, no division per pixel
// One input buffer, reused every frame (frames are handled one at a time). The bars never change,
// so they're painted gray once and only the picture inside them is rewritten.
let inputBuf: { data: Float32Array; key: string } | null = null;

/** uint8 planar RGB from the resizer -> float 0..1 tensor. Bars become ultralytics' gray (114). */
function toTensor(pixels: Uint8Array, c: Content): Tensor {
  const S = config.IMG_SIZE;
  const SS = S * S;
  const key = `${c.padX},${c.padY},${c.w},${c.h}`;
  if (inputBuf?.key !== key) inputBuf = { data: new Float32Array(3 * SS).fill(114 / 255), key };
  const out = inputBuf.data;
  for (let ch = 0; ch < 3; ch++) {
    for (let y = c.padY; y < c.padY + c.h; y++) {
      const row = ch * SS + y * S;
      for (let i = row + c.padX, end = row + c.padX + c.w; i < end; i++) out[i] = TO_FLOAT[pixels[i]!]!;
    }
  }
  return new Tensor("float32", out, [1, 3, S, S]);
}

/** Depth model -> grid of metres covering only the real picture (bars cut off). */
async function runDepth(depthModel: InferenceSession, input: Tensor, c: Content): Promise<Grid> {
  const S = config.IMG_SIZE;
  const result = await depthModel.run({ [depthModel.inputNames[0]!]: input });
  const raw = result[depthModel.outputNames[0]!]!.data as Float32Array; // 1x1xSxS
  const data = new Float32Array(c.w * c.h);
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      data[y * c.w + x] = raw[(y + c.padY) * S + (x + c.padX)]! * config.SCALE;
    }
  }
  return { data, w: c.w, h: c.h };
}

function iou(a: Rect, b: Rect) {
  const iw = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const ih = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = iw * ih;
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return union > 0 ? inter / union : 0;
}

let loggedDims = false;

/** Detector -> boxes in the same coordinates as the depth grid. Handles both output formats:
 *  - end-to-end (1, 300, 6): ready-made boxes [x1, y1, x2, y2, score, class], no NMS needed
 *  - classic    (1, 4 + classes + extra, anchors): one candidate per anchor, NMS needed */
async function runDetector(detector: InferenceSession, input: Tensor, c: Content) {
  const result = await detector.run({ [detector.inputNames[0]!]: input });
  const out = result[detector.outputNames[0]!]!;
  const [, rows, n] = out.dims as number[];
  const pred = out.data as Float32Array;
  if (!loggedDims) {
    console.log("detector output dims:", out.dims);
    loggedDims = true;
  }

  const found: { box: Rect; cls: number; conf: number }[] = [];
  if (n === 6) {
    // end-to-end: each row is already a final box
    for (let r = 0; r < rows!; r++) {
      const [x1, y1, x2, y2, conf, cls] = pred.subarray(r * 6, r * 6 + 6);
      if (conf! <= DET_CONF) continue;
      found.push({ box: [x1!, y1!, x2!, y2!], cls: Math.round(cls!), conf: conf! });
    }
    return toGrid(found, c);
  }

  const at = (row: number, j: number) => pred[row * n! + j]!;
  // best class per anchor, then class-aware NMS
  for (let j = 0; j < n!; j++) {
    let cls = 0, conf = -1;
    for (let k = 0; k < NAMES.length && 4 + k < rows!; k++) {
      if (at(4 + k, j) > conf) { conf = at(4 + k, j); cls = k; }
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
  return toGrid(kept, c);
}

/** Model pixels -> depth-grid pixels (just remove the side bars; same scale). */
function toGrid(boxes: { box: Rect; cls: number; conf: number }[], c: Content) {
  const clip = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  for (const d of boxes) {
    const [x1, y1, x2, y2] = d.box;
    d.box = [clip(x1 - c.padX, c.w), clip(y1 - c.padY, c.h), clip(x2 - c.padX, c.w), clip(y2 - c.padY, c.h)];
  }
  return boxes;
}

/** Stretch a depth grid to w x h (bilinear). LiDAR depth and the camera picture cover the same view. */
export function fitTo(g: Grid, w: number, h: number): Grid {
  if (g.w === w && g.h === h) return g;
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(g.h - 1, Math.max(0, ((y + 0.5) * g.h) / h - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(g.h - 1, y0 + 1), ay = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(g.w - 1, Math.max(0, ((x + 0.5) * g.w) / w - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(g.w - 1, x0 + 1), ax = fx - x0;
      const top = g.data[y0 * g.w + x0]! * (1 - ax) + g.data[y0 * g.w + x1]! * ax;
      const bot = g.data[y1 * g.w + x0]! * (1 - ax) + g.data[y1 * g.w + x1]! * ax;
      data[y * w + x] = top * (1 - ay) + bot * ay;
    }
  }
  return { data, w, h };
}

/** AI depth model only (no detector): used once to check which way the LiDAR picture is turned. */
export async function estimateDepth(pixels: Uint8Array, frameW: number, frameH: number): Promise<Grid> {
  const { depthModel } = await loadModels();
  const c = contentArea(frameW, frameH);
  return runDepth(depthModel, toTensor(pixels, c), c);
}

/** Run the AI on one resized camera frame. Returns everything the app needs.
 *  pixels:   320x320 uint8 planar RGB from the resizer
 *  frameW/H: the camera frame's size (to know where the side bars are)
 *  measured: upright LiDAR depth in metres, if this iPhone has LiDAR -> the depth model is skipped */
export async function look(pixels: Uint8Array, frameW: number, frameH: number, measured?: Grid | null): Promise<Info> {
  const { depthModel, detector } = await loadModels();
  const c = contentArea(frameW, frameH);
  const t0 = performance.now();
  const input = toTensor(pixels, c);
  const t1 = performance.now();
  const [depth, found] = await Promise.all([
    measured ? fitTo(measured, c.w, c.h) : runDepth(depthModel, input, c), // LiDAR: no depth model needed
    runDetector(detector, input, c),
  ]);
  const t2 = performance.now();
  const info = analyze(depth, readBoxes(found, NAMES), !!measured);
  const t3 = performance.now();
  // TODO: remove this log once timings look good
  console.log(`depth from ${measured ? "LiDAR" : "AI model"} | prep ${(t1 - t0).toFixed(0)}ms | ` +
    `models ${(t2 - t1).toFixed(0)}ms | analyze ${(t3 - t2).toFixed(0)}ms`);
  return info;
}