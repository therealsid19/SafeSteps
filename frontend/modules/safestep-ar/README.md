# safestep-ar

Native obstacle detection for LiDAR iPhones (12 Pro and newer Pro models), using ARKit, like the Measure app.

- `ios/Hazards.swift`: LiDAR depth -> 3D points -> what's in the 70 cm walking path, beside it, and holes in the floor.
  The floor comes from ARKit's plane detection, so the phone's height is measured, not guessed.
- `ios/Detector.swift`: yolo26n on the Neural Engine (CoreML + Vision). Runs separately, so warnings never wait for it.
- `ios/SafeStepARView.swift`: camera preview + ARKit session, sends small results to JS.
- JS side: `index.ts`, used by `src/detection/useARDetection.ts`.

Other phones (no LiDAR, Android) keep using `src/detection/useDetection.ts`.

## The object detector model

Warnings work without it; only object names ("Chair ahead") need it. In the `detect` repo:

```python
from ultralytics import YOLO
YOLO("yolo26n.pt").export(format="coreml", imgsz=640)  # -> yolo26n.mlpackage
```

Then, from `frontend/`: `bun run copy-coreml` (copies it to `ios/models/`, which git ignores),
and rebuild: `npx expo run:ios --device`. The model is compiled on the phone on first launch.

## Building

This is native code: after pulling changes to `ios/`, rebuild with `npx expo run:ios --device`
(a Metro reload is not enough). The log shows `camera: ... | ARKit pipeline on` when it's in use.
