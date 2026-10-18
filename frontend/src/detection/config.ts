// Tuning numbers, from the detect repo's src/config.ts, adjusted for a phone held upright.
// The models in assets/models/ were exported by detect's scripts/export_models.py with
// IMG_SIZE and CLASSES below. Change them there, re-export, then run `bun run copy-models`.

export const IMG_SIZE = 320;

export const SCALE = 0.53;
export const BOX_W = 0.5;
export const BOX_H = 0.5;

// Words YOLOE looks for. Baked into models/yoloe.onnx; must match detect's CLASSES exactly.
export const CLASSES = ["person", "bicycle", "car", "chair", "bench", "table", "dog",
  "stairs", "door", "pole", "trash can", "potted plant", "suitcase"];

export const IMPORTANT = new Set(CLASSES);

export const MIN_CONF = 0.5;

export const SPEAK_RANGE = 3.0;
export const REPEAT_EVERY = 4.0;
export const VERY_CLOSE = 1.0;

export const EDGE_STEP = 3; // detect uses 8 at 640 px wide; our frames are 240 px wide
export const EDGE_JUMP = 0.3; // distance jumps by n%+ = a "cliff" (an object's edge)
export const EDGE_ROWS = 0.2; // wall if n% or fewer of the rows contain a cliff
export const SIDE_RANGE = 1.5;

// --- Camera position (for height math) ---
// tilt is updated live from the phone's motion sensor (see useObstacleDetection).
export const cam = {
  height: 1.2, // meters from the floor to the phone (held at chest height)
  tilt: 0.0, // degrees pointing down (0 = looking straight ahead)
  vfov: 63.0, // degrees top to bottom; phone main camera held in portrait
};
export const LOW_RANGE = 3.0; // only care about low obstacles / drop-offs closer than this (meters)

export const FLOOR_TOL = 0.15; // meters: within ±n cm of 0 counts as floor
export const LOW_TOP = 1.0; // meters: low obstacles are between FLOOR_TOL and this height
export const LOW_MIN = 0.03; // at least 3% of the path area must be hazard pixels to count

export const SIDE_REPEAT = 10.0; // seconds: remind about the same side walls at most this often

// --- Camera frames ---
export const FRAME_W = 240; // photos are resized to this width before analysis (height keeps aspect)
