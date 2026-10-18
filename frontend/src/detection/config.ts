// Tuning numbers, from the detect repo's src/config.ts, adjusted for a phone held upright.
// The models in assets/models/ were exported by detect's scripts/export_models.py with
// IMG_SIZE and CLASSES below. Change them there, re-export, then run `bun run copy-models`.
// yolo26n.onnx: export with detect's script too (or: YOLO("yolo26n.pt").export(format="onnx", imgsz=320)).

export const IMG_SIZE = 320;

export const SCALE = 0.53; // AI depth model only (LiDAR measures real metres). TODO: re-measure on the iPhone
export const BOX_W = 0.5;
export const BOX_H = 0.5;

// --- Object detector ---
// false = yolo26n (normal detector, 80 everyday things): lighter, faster, confident on chairs/people.
// true  = YOLOE with our own word list (can do stairs/door/pole), but heavier and less confident.
// TODO(stairs): switch back to YOLOE once the basics work well, or fine-tune yolo26n on stairs.
export const USE_YOLOE = false;

// Words YOLOE looks for. Baked into models/yoloe.onnx; must match detect's CLASSES exactly.
export const YOLOE_CLASSES = ["person", "bicycle", "car", "chair", "bench", "table", "dog",
  "stairs", "door", "pole", "trash can", "potted plant", "suitcase"];

// yolo26n's fixed list, in its exact order (the model outputs a number; this turns it into a name).
export const COCO_NAMES = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light",
  "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
  "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
  "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard",
  "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
  "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
  "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard",
  "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase",
  "scissors", "teddy bear", "hair drier", "toothbrush",
];
// the yolo26n names worth saying out loud while walking (everything else is just "object")
const COCO_IMPORTANT = ["person", "bicycle", "car", "motorcycle", "bus", "truck", "chair", "bench",
  "couch", "dining table", "dog", "fire hydrant", "stop sign", "potted plant", "suitcase", "backpack", "bed", "tv"];

/** Class number -> name, for whichever detector is in use. */
export const CLASSES = USE_YOLOE ? YOLOE_CLASSES : COCO_NAMES;
/** Names we announce, and the list shown in Find mode. */
export const FINDABLE = USE_YOLOE ? YOLOE_CLASSES : COCO_IMPORTANT;
export const IMPORTANT = new Set(FINDABLE);

export const MIN_CONF = 0.5;

export const SPEAK_RANGE = 3.0;
export const REPEAT_EVERY = 4.0;
export const VERY_CLOSE = 1.0;

export const EDGE_STEP = 3; // detect uses 8 at 640 px wide; our frames are 240 px wide
export const EDGE_JUMP = 0.3; // distance jumps by n%+ = a "cliff" (an object's edge)
export const EDGE_ROWS = 0.2; // wall if n% or fewer of the rows contain a cliff
export const SIDE_RANGE = 1.5;

// --- Camera position (for height math) ---
// tilt is updated live from the phone's motion sensor; with LiDAR, height and focal are
// measured live too (see useDetection), like the iPhone's Measure app does.
export const CAM_HEIGHT = 1.2; // meters from the floor to the phone (chest height): the guess when there's no LiDAR
export const cam = {
  height: CAM_HEIGHT,
  tilt: 0.0, // degrees pointing down (0 = looking straight ahead)
  vfov: 63.0, // degrees top to bottom; phone main camera held in portrait (used when focal is unknown)
  focal: 0, // focal length / picture height, from the LiDAR's own calibration. 0 = unknown: use vfov
};

// --- Measuring the phone's height from the floor (LiDAR only) ---
export const FLOOR_FIT_ROWS = 0.4;    // look for floor in the bottom 40% of the picture
export const FLOOR_FIT_MIN = 0.25;    // at least 25% of those pixels must agree on one floor level
export const CAM_HEIGHT_MIN = 0.5;    // meters: ignore floor guesses outside this range
export const CAM_HEIGHT_MAX = 2.0;
export const CAM_HEIGHT_SMOOTH = 0.3; // how fast the measured height follows a new reading (0..1)
export const LOW_RANGE = 3.0; // only care about low obstacles / drop-offs closer than this (meters)

export const FLOOR_TOL = 0.15; // meters: within ±n cm of 0 counts as floor
export const LOW_TOP = 1.0; // meters: low obstacles are between FLOOR_TOL and this height
export const LOW_MIN = 0.03; // at least 3% of the path area must be hazard pixels to count

// --- Drop-offs (stricter: a false "drop-off" is very scary for the user) ---
export const DROP_MIN = 0.08;   // at least 8% of the path must look sunken (low obstacles only need 3%)
export const DROP_SKIP = 0.10;  // ignore the bottom 10% of the picture: depth there (floor at your feet) is unreliable
export const DROP_FRAMES = 3;   // only warn after this many frames in a row see the drop-off

export const SIDE_REPEAT = 10.0; // seconds: remind about the same side walls at most this often

// --- Camera frames ---
// --- LiDAR (iPhone Pro) ---
export const LIDAR_MAX_AGE_MS = 300; // use a LiDAR depth frame only if it's at most this old, else fall back to the AI model
export const LIDAR_NO_READING = 10;  // metres: LiDAR pixels with no reading (too far / no return) count as far away
export const LIDAR_TURN_TRIES = 10;  // give up the automatic LiDAR orientation check after this many frames

export const SPEECH_RATE = 1.15; // a bit faster than normal: shorter sentences = fresher warnings
// --- ARKit pipeline (LiDAR iPhones, modules/safestep-ar): same numbers, sent to the native side ---
export const PATH_WIDTH = 0.7; // metres: the walking path straight ahead
export const HEAD_TOP = 2.0;   // metres above the floor: ignore anything higher
export const AR_SETTINGS = {
  speakRange: SPEAK_RANGE,
  pathHalfWidth: PATH_WIDTH / 2,
  sideRange: SIDE_RANGE,
  floorTol: FLOOR_TOL,
  lowTop: LOW_TOP,
  headTop: HEAD_TOP,
};
export const AR_CLASSES = { names: COCO_NAMES, important: FINDABLE, minConf: MIN_CONF };
