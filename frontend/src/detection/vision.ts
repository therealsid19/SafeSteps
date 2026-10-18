// Ported unchanged from the detect repo (src/vision.ts). Keep the two in sync.
// Pure math on depth maps: no models, no camera. (The numpy half of the old camera.py.)
import * as config from "./config";

/** A w x h grid of numbers, stored row by row. */
export interface Grid {
  data: Float32Array;
  w: number;
  h: number;
}

/** [x1, y1, x2, y2, name]  name = real name, or null if unsure / not important */
export type Box = [number, number, number, number, string | null];
export type Rect = [number, number, number, number];

export interface Info {
  dist: number;
  label: string | null;
  boxes: Box[];
  box: Rect;
  edges: number;
  left: string | null;
  right: string | null;
  heights: Grid;
  depth: Grid;
  drop: number | null; // drop-off distance seen in THIS frame (useDetection confirms it over several frames)
  floorNear: number;   // debug: median height of the floor area near the bottom of the path (should be ~0 m)
  floorMid: number;    // debug: median height of the floor area a bit further ahead (should be ~0 m)
}

/** grid[y1:y2, x1:x2] like numpy: bounds are clipped, may be empty. */
export function crop(g: Grid, x1: number, y1: number, x2: number, y2: number): Grid {
  x1 = Math.max(0, Math.min(x1, g.w)); x2 = Math.max(x1, Math.min(x2, g.w));
  y1 = Math.max(0, Math.min(y1, g.h)); y2 = Math.max(y1, Math.min(y2, g.h));
  const w = x2 - x1, h = y2 - y1;
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    data.set(g.data.subarray((y1 + y) * g.w + x1, (y1 + y) * g.w + x2), y * w);
  }
  return { data, w, h };
}

/** Sorting is the slow part of percentile(). Big areas are sampled down to this many values first;
 *  the answer is practically the same (it's a statistic), but much faster on the phone. */
const MAX_SAMPLES = 4096;

/** np.percentile with linear interpolation. NaN for an empty input. */
export function percentile(values: Float32Array, q: number): number {
  if (values.length === 0) return NaN;
  let src = values;
  if (values.length > MAX_SAMPLES) {
    const step = values.length / MAX_SAMPLES; // take every n-th value, spread evenly
    src = new Float32Array(MAX_SAMPLES);
    for (let i = 0; i < MAX_SAMPLES; i++) src[i] = values[Math.floor(i * step)]!;
  }
  const sorted = Float32Array.from(src).sort();
  const pos = (q / 100) * (sorted.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export const median = (values: Float32Array) => percentile(values, 50);

export function readBoxes(raw: { box: Rect; cls: number; conf: number }[], names: string[]): Box[] {
  return raw.map(({ box: [x1, y1, x2, y2], cls, conf }) => {
    let name: string | null = names[cls] ?? null;
    if (name === null || !config.IMPORTANT.has(name) || conf < config.MIN_CONF) name = null;
    return [Math.trunc(x1), Math.trunc(y1), Math.trunc(x2), Math.trunc(y2), name];
  });
}

/** Name of the closest named object overlapping the cane box, or null. */
export function objectInBox(boxes: Box[], depth: Grid, x1: number, y1: number, x2: number, y2: number): string | null {
  let bestName: string | null = null, bestDist = 999;
  for (const [bx1, by1, bx2, by2, name] of boxes) {
    if (name === null) continue;
    if (!(bx1 < x2 && bx2 > x1 && by1 < y2 && by2 > y1)) continue;
    const d = median(crop(depth, bx1, by1, bx2, by2).data);
    if (d < bestDist) {
      bestName = name;
      bestDist = d;
    }
  }
  return bestName;
}

/** The green box in the middle of the screen: [x1, y1, x2, y2]. */
export function caneBox(w: number, h: number): Rect {
  const bw = Math.trunc(w * config.BOX_W), bh = Math.trunc(h * config.BOX_H);
  return [Math.floor((w - bw) / 2), Math.floor((h - bh) / 2), Math.floor((w + bw) / 2), Math.floor((h + bh) / 2)];
}

/** Share of rows (0.0 to 1.0) that contain a 'cliff' */
export function edgeRows(area: Grid): number {
  const k = config.EDGE_STEP;
  if (area.h === 0) return NaN;
  let cliffRows = 0;
  for (let y = 0; y < area.h; y++) {
    const row = y * area.w;
    for (let x = 0; x + k < area.w; x++) {
      const here = area.data[row + x]!, neighbor = area.data[row + x + k]!; // each pixel vs the one k to its right
      const jump = Math.abs(neighbor - here) / Math.min(neighbor, here); // jump as %
      if (jump > config.EDGE_JUMP) {
        cliffRows++; // this row has a cliff
        break;
      }
    }
  }
  return cliffRows / area.h; // share of rows with a cliff
}

/** Closest distance (10th percentile) in an area. With `heights` (LiDAR), floor pixels and
 *  "no reading" pixels are left out, so the floor ahead is never mistaken for an obstacle.
 *  Nothing left -> LIDAR_NO_READING (= clear). */
function nearest(depth: Grid, heights: Grid | null, x1: number, y1: number, x2: number, y2: number): number {
  const d = crop(depth, x1, y1, x2, y2).data;
  if (!heights) return percentile(d, 10);
  const hs = crop(heights, x1, y1, x2, y2).data;
  const keep = new Float32Array(d.length);
  let n = 0;
  for (let i = 0; i < d.length; i++) {
    if (hs[i]! >= config.FLOOR_TOL && d[i]! < config.LIDAR_NO_READING) keep[n++] = d[i]!;
  }
  if (n === 0 || n / d.length < config.LOW_MIN) return config.LIDAR_NO_READING; // a few stray pixels = noise
  return percentile(keep.subarray(0, n), 10);
}

/** One side zone: a name, 'wall', or null if nothing is close */
export function sideCheck(depth: Grid, boxes: Box[], sx1: number, y1: number, sx2: number, y2: number,
                          heights: Grid | null = null): string | null {
  const d = nearest(depth, heights, sx1, y1, sx2, y2);
  if (!(d < config.SIDE_RANGE)) return null; // also null for an empty zone (NaN)
  return objectInBox(boxes, depth, sx1, y1, sx2, y2) ?? "wall";
}

/** Focal length in pixels for a picture h rows tall: the LiDAR's real calibration if we have it, else from vfov. */
function focal(h: number): number {
  return config.cam.focal > 0 ? config.cam.focal * h : (h / 2) / Math.tan(((config.cam.vfov / 2) * Math.PI) / 180);
}

/**
 * LiDAR only: how high the phone is above the floor, measured from the floor itself (like the Measure app).
 * Every floor pixel lies the same distance below the camera, so the most common "drop below the camera"
 * in the bottom of the picture is the camera's height. Null if too little floor is in view.
 */
export function cameraHeight(depth: Grid): number | null {
  const { w, h } = depth;
  const f = focal(h);
  const tilt = (config.cam.tilt * Math.PI) / 180;
  const cos = Math.cos(tilt), sin = Math.sin(tilt);
  const BIN = 0.05; // 5 cm steps
  const bins = new Uint32Array(Math.ceil(config.CAM_HEIGHT_MAX / BIN) + 2);
  let total = 0;
  for (let y = Math.floor(h * (1 - config.FLOOR_FIT_ROWS)); y < h; y++) {
    const rel = (y - h / 2) / f;
    for (let x = 0; x < w; x += 2) { // every 2nd pixel is plenty
      const d = depth.data[y * w + x]!;
      if (!(d > 0 && d < config.LOW_RANGE + 1)) continue; // no reading, or too far to measure precisely
      total++;
      const drop = d * rel * cos + d * sin; // same math as heightMap
      if (drop >= config.CAM_HEIGHT_MIN && drop <= config.CAM_HEIGHT_MAX) bins[Math.floor(drop / BIN)]!++;
    }
  }
  let best = 1;
  for (let i = 1; i < bins.length - 1; i++) if (bins[i]! > bins[best]!) best = i;
  const votes = bins[best - 1]! + bins[best]! + bins[best + 1]!;
  if (total < 200 || votes < total * config.FLOOR_FIT_MIN) return null;
  // centre of the peak (weighted over its neighbours, for better than 5 cm precision)
  let sum = 0;
  for (let i = best - 1; i <= best + 1; i++) sum += bins[i]! * (i + 0.5) * BIN;
  return sum / votes;
}

/** Height above the floor (metres) for every pixel. */
export function heightMap(depth: Grid): Grid {
  const { w, h } = depth;
  const f = focal(h); // turns rows below the middle into an angle
  const tilt = (config.cam.tilt * Math.PI) / 180;
  const cos = Math.cos(tilt), sin = Math.sin(tilt);
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const rel = (y - h / 2) / f; // each row's position relative to the middle, (-) above, (+) below
    for (let x = 0; x < w; x++) {
      const d = depth.data[y * w + x]!;
      const down = d * rel; // how far below the camera's centre line
      const drop = down * cos + d * sin; // total drop below camera, with tilt
      data[y * w + x] = config.cam.height - drop; // height = camera height - drop
    }
  }
  return { data, w, h };
}

/** If enough of the path matches the mask, return how close it is. Else null. */
export function findInPath(pathDepth: Grid, mask: Uint8Array, minShare = config.LOW_MIN): number | null {
  let count = 0;
  for (const m of mask) count += m;
  if (mask.length === 0 || count / mask.length < minShare) return null; // too few pixels -> noise
  const hits = new Float32Array(count);
  for (let i = 0, j = 0; i < mask.length; i++) if (mask[i]) hits[j++] = pathDepth.data[i]!;
  return percentile(hits, 10); // closest part of the matching pixels
}

/** Turn a depth map (metres) + detected boxes into everything the app needs.
 *  measured = LiDAR depth: heights are trustworthy, so floor pixels can be left out of "what's ahead". */
export function analyze(depth: Grid, boxes: Box[], measured = false): Info {
  const { w, h } = depth;
  const heights = heightMap(depth);
  const solid = measured ? heights : null;

  const [x1, y1, x2, y2] = caneBox(w, h);
  let dist = nearest(depth, solid, x1, y1, x2, y2);
  let label = objectInBox(boxes, depth, x1, y1, x2, y2);

  const edges = edgeRows(crop(depth, 0, y1, w, y2));
  if (label === null && edges <= config.EDGE_ROWS) label = "wall";

  let left = sideCheck(depth, boxes, 0, y1, x1, y2, solid);
  let right = sideCheck(depth, boxes, x2, y1, w, y2, solid);

  if (label === "wall") left = right = null; // facing a wall: the sides are the same wall, not walls beside me

  // low obstacles and drop-offs in my path: from the top of the green box all the way down
  const pathD = crop(depth, x1, y1, x2, h);
  const pathH = crop(heights, x1, y1, x2, h);
  const dropRows = Math.floor(pathD.h * (1 - config.DROP_SKIP)); // drop-offs: skip the rows nearest the feet

  // Where the floor SHOULD be in each row (from camera height + tilt). At a drop-off the measured
  // distance jumps far away, so "is it near?" must use this expected floor distance, not the measurement.
  const f = focal(h);
  const tilt = (config.cam.tilt * Math.PI) / 180;
  const floorAt = new Float32Array(pathD.data.length); // expected floor distance per pixel (by row)
  for (let r = 0; r < pathD.h; r++) {
    const rel = (y1 + r - h / 2) / f;
    const down = rel * Math.cos(tilt) + Math.sin(tilt); // how steeply this row looks down
    const z = down > 0 ? config.cam.height / down : Infinity; // above the horizon: no floor in this row
    floorAt.fill(z, r * pathD.w, (r + 1) * pathD.w);
  }
  const floorGrid: Grid = { data: floorAt, w: pathD.w, h: pathD.h };

  const lowMask = new Uint8Array(pathD.data.length);
  const dropMask = new Uint8Array(pathD.data.length);
  for (let i = 0; i < pathD.data.length; i++) {
    const ph = pathH.data[i]!;
    if (pathD.data[i]! < config.LOW_RANGE) lowMask[i] = ph >= config.FLOOR_TOL && ph < config.LOW_TOP ? 1 : 0;
    const row = Math.floor(i / pathD.w);
    // LiDAR "no reading" (dark/shiny floor) is not a hole: never count it as a drop-off
    const noReading = measured && pathD.data[i]! >= config.LIDAR_NO_READING;
    if (row < dropRows && floorAt[i]! < config.LOW_RANGE && !noReading) dropMask[i] = ph < -config.FLOOR_TOL ? 1 : 0;
  }
  const low = findInPath(pathD, lowMask);
  // NOT applied here: useDetection confirms it over several frames first.
  // Distance = where the floor stops (expected floor distance), not how deep the hole is.
  const drop = findInPath(floorGrid, dropMask, config.DROP_MIN);

  if (low !== null && low < dist - 0.3) { // clearly closer than what's in the green box
    dist = low;
    label = objectInBox(boxes, depth, x1, y1, x2, h) ?? "low obstacle";
  }

  // debug numbers for calibration: on a flat, empty floor both should be close to 0 m
  const floorBand = (from: number, to: number) =>
    median(crop(pathH, 0, Math.floor(pathH.h * from), pathH.w, Math.floor(pathH.h * to)).data);
  const floorNear = floorBand(0.85, 1.0);
  const floorMid = floorBand(0.6, 0.8);

  return { dist, label, boxes, box: [x1, y1, x2, y2], edges, left, right, heights, depth, drop, floorNear, floorMid };
}