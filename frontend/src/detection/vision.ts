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

/** np.percentile with linear interpolation. NaN for an empty input. */
export function percentile(values: Float32Array, q: number): number {
  if (values.length === 0) return NaN;
  const sorted = Float32Array.from(values).sort();
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

/** One side zone: a name, 'wall', or null if nothing is close */
export function sideCheck(depth: Grid, boxes: Box[], sx1: number, y1: number, sx2: number, y2: number): string | null {
  const d = percentile(crop(depth, sx1, y1, sx2, y2).data, 10);
  if (!(d < config.SIDE_RANGE)) return null; // also null for an empty zone (NaN)
  return objectInBox(boxes, depth, sx1, y1, sx2, y2) ?? "wall";
}

/** Height above the floor (metres) for every pixel. */
export function heightMap(depth: Grid): Grid {
  const { w, h } = depth;
  const f = (h / 2) / Math.tan(((config.cam.vfov / 2) * Math.PI) / 180); // turns rows below the middle into an angle
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
export function findInPath(pathDepth: Grid, mask: Uint8Array): number | null {
  let count = 0;
  for (const m of mask) count += m;
  if (mask.length === 0 || count / mask.length < config.LOW_MIN) return null; // too few pixels -> noise
  const hits = new Float32Array(count);
  for (let i = 0, j = 0; i < mask.length; i++) if (mask[i]) hits[j++] = pathDepth.data[i]!;
  return percentile(hits, 10); // closest part of the matching pixels
}

/** Turn a depth map (metres) + detected boxes into everything the app needs. */
export function analyze(depth: Grid, boxes: Box[]): Info {
  const { w, h } = depth;
  const heights = heightMap(depth);

  const [x1, y1, x2, y2] = caneBox(w, h);
  let dist = percentile(crop(depth, x1, y1, x2, y2).data, 10);
  let label = objectInBox(boxes, depth, x1, y1, x2, y2);

  const edges = edgeRows(crop(depth, 0, y1, w, y2));
  if (label === null && edges <= config.EDGE_ROWS) label = "wall";

  let left = sideCheck(depth, boxes, 0, y1, x1, y2);
  let right = sideCheck(depth, boxes, x2, y1, w, y2);

  if (label === "wall") left = right = null; // facing a wall: the sides are the same wall, not walls beside me

  // low obstacles and drop-offs in my path: from the top of the green box all the way down
  const pathD = crop(depth, x1, y1, x2, h);
  const pathH = crop(heights, x1, y1, x2, h);
  const lowMask = new Uint8Array(pathD.data.length);
  const dropMask = new Uint8Array(pathD.data.length);
  for (let i = 0; i < pathD.data.length; i++) {
    if (!(pathD.data[i]! < config.LOW_RANGE)) continue;
    const ph = pathH.data[i]!;
    lowMask[i] = ph >= config.FLOOR_TOL && ph < config.LOW_TOP ? 1 : 0;
    dropMask[i] = ph < -config.FLOOR_TOL ? 1 : 0;
  }
  const low = findInPath(pathD, lowMask);
  const drop = findInPath(pathD, dropMask);

  if (drop !== null) { // most dangerous: always wins
    dist = drop;
    label = "drop-off";
  } else if (low !== null && low < dist - 0.3) { // clearly closer than what's in the green box
    dist = low;
    label = objectInBox(boxes, depth, x1, y1, x2, h) ?? "low obstacle";
  }

  return { dist, label, boxes, box: [x1, y1, x2, y2], edges, left, right, heights, depth };
}
