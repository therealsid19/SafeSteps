// What's in the walking path, from ARKit's LiDAR depth. Pure math, no UI.
// Every depth pixel becomes a real 3D point (ARKit knows the lens and where the phone is),
// so "height above the floor" and "how far ahead" are measured, not guessed.
import ARKit
import simd

/// Thresholds, sent from JS (src/detection/config.ts) so both pipelines use the same numbers.
struct HazardSettings {
  var speakRange: Float = 3.0     // metres ahead to look along the path
  var pathHalfWidth: Float = 0.35 // the path is 70 cm wide (shoulders + a bit)
  var sideRange: Float = 1.5      // metres ahead to look beside the path
  var sideWidth: Float = 0.9      // how far beside the path counts as "on your left/right"
  var floorTol: Float = 0.15      // within ±15 cm of the floor = floor
  var lowTop: Float = 1.0         // obstacles shorter than this are "low obstacles"
  var headTop: Float = 2.0        // ignore things higher than this (ceiling, signs far above)
  var minPoints = 25              // this many LiDAR points at one distance = a real thing, not noise
  var dropMinPoints = 120         // a drop-off needs many sunken, high-confidence points

  init() {}
  init(_ d: [String: Double]) {
    func f(_ key: String, _ fallback: Float) -> Float { d[key].map { Float($0) } ?? fallback }
    speakRange = f("speakRange", speakRange)
    pathHalfWidth = f("pathHalfWidth", pathHalfWidth)
    sideRange = f("sideRange", sideRange)
    sideWidth = f("sideWidth", sideWidth)
    floorTol = f("floorTol", floorTol)
    lowTop = f("lowTop", lowTop)
    headTop = f("headTop", headTop)
  }
}

/// The depth + camera of one ARFrame (kept instead of the frame, which ARKit wants back quickly).
struct DepthSnapshot {
  let depth: CVPixelBuffer
  let confidence: CVPixelBuffer?
  let transform: simd_float4x4
  let intrinsics: simd_float3x3
  let imageSize: CGSize
}

/// Where the phone is and which way it faces, flattened onto the floor (gravity = -y in ARKit).
struct Pose {
  let pos: SIMD3<Float>
  let fwd: SIMD2<Float>   // forward along the floor (x, z)
  let right: SIMD2<Float>

  init(_ t: simd_float4x4, fallback: SIMD2<Float>) {
    pos = SIMD3(t.columns.3.x, t.columns.3.y, t.columns.3.z)
    let look = SIMD2(-t.columns.2.x, -t.columns.2.z) // the camera looks along -z
    let len = simd_length(look)
    fwd = len > 0.2 ? look / len : fallback // pointing (almost) straight down: keep the last direction
    right = SIMD2(-fwd.y, fwd.x)
  }

  /// metres ahead / to the right (+) or left (-) of the phone, along the floor
  func local(_ p: SIMD3<Float>) -> (ahead: Float, lateral: Float) {
    let r = SIMD2(p.x - pos.x, p.z - pos.z)
    return (simd_dot(r, fwd), simd_dot(r, right))
  }
}

struct SideResult {
  let dist: Float
  let tall: Bool
}

struct HazardResult {
  let dist: Float?       // nearest thing in the path (metres ahead), nil = clear
  let top: Float         // its highest point above the floor
  let wall: Bool         // tall and as wide as the path
  let drop: Float?       // where the floor ahead drops away
  let left: SideResult?
  let right: SideResult?
  let floorY: Float
  let floorFromPlane: Bool // floor found by ARKit (true) or estimated from the points (false)
  let pose: Pose
}

private struct Intrinsics {
  let fx, fy, cx, cy: Float
  /// ARKit's intrinsics are for the camera image; the depth map is smaller (256x192).
  init(_ s: DepthSnapshot, w: Int, h: Int) {
    let sx = Float(w) / Float(s.imageSize.width), sy = Float(h) / Float(s.imageSize.height)
    let k = s.intrinsics
    fx = k[0][0] * sx; fy = k[1][1] * sy; cx = k[2][0] * sx; cy = k[2][1] * sy
  }
}

@inline(__always)
private func worldPoint(_ u: Float, _ v: Float, _ d: Float, _ k: Intrinsics, _ t: simd_float4x4) -> SIMD3<Float> {
  // camera space: x right, y up, looking along -z; d = distance along the lens axis
  let p = t * SIMD4<Float>((u - k.cx) / k.fx * d, -(v - k.cy) / k.fy * d, -d, 1)
  return SIMD3(p.x, p.y, p.z)
}

/// Locks the depth (+ confidence) buffers for reading. Confidence: 0 low, 1 medium, 2 high.
private func withDepth<T>(_ s: DepthSnapshot,
                          _ body: (Int, Int, (Int, Int) -> Float, (Int, Int) -> UInt8) -> T) -> T {
  CVPixelBufferLockBaseAddress(s.depth, .readOnly)
  if let c = s.confidence { CVPixelBufferLockBaseAddress(c, .readOnly) }
  defer {
    CVPixelBufferUnlockBaseAddress(s.depth, .readOnly)
    if let c = s.confidence { CVPixelBufferUnlockBaseAddress(c, .readOnly) }
  }
  let w = CVPixelBufferGetWidth(s.depth), h = CVPixelBufferGetHeight(s.depth)
  let dBase = CVPixelBufferGetBaseAddress(s.depth)!, dRow = CVPixelBufferGetBytesPerRow(s.depth)
  let cBase = s.confidence.flatMap { CVPixelBufferGetBaseAddress($0) }
  let cRow = s.confidence.map { CVPixelBufferGetBytesPerRow($0) } ?? 0
  let depth = { (x: Int, y: Int) -> Float in (dBase + y * dRow).assumingMemoryBound(to: Float32.self)[x] }
  let conf = { (x: Int, y: Int) -> UInt8 in
    guard let cBase else { return 2 }
    return (cBase + y * cRow).assumingMemoryBound(to: UInt8.self)[x]
  }
  return body(w, h, depth, conf)
}

final class HazardEngine {
  var settings = HazardSettings()
  private var points: [SIMD4<Float>] = [] // world xyz + confidence, reused every frame
  private var lastFwd = SIMD2<Float>(0, -1)
  private var lastFloorY: Float?

  private static let bin: Float = 0.05 // 5 cm distance steps
  private static let bins = 100        // up to 5 m

  func analyze(_ s: DepthSnapshot, planeFloorY: Float?) -> HazardResult {
    let pose = Pose(s.transform, fallback: lastFwd)
    lastFwd = pose.fwd

    // 1. every confident depth pixel -> a 3D point in the world
    points.removeAll(keepingCapacity: true)
    withDepth(s) { w, h, depth, conf in
      let k = Intrinsics(s, w: w, h: h)
      for y in 0..<h {
        for x in 0..<w {
          let d = depth(x, y)
          let c = conf(x, y)
          guard d > 0.1, d < 5, d.isFinite, c >= 1 else { continue }
          let p = worldPoint(Float(x) + 0.5, Float(y) + 0.5, d, k, s.transform)
          points.append(SIMD4(p.x, p.y, p.z, Float(c)))
        }
      }
    }

    // 2. the floor: ARKit's detected floor plane, else the most common level below the phone
    let floorY = planeFloorY ?? estimateFloor(pose) ?? lastFloorY ?? (pose.pos.y - 1.2)
    lastFloorY = floorY

    // 3. sort the points into the path ahead, the sides, and holes in the floor
    let st = settings, n = HazardEngine.bins, bin = HazardEngine.bin
    var path = [Int](repeating: 0, count: n), pathTop = [Float](repeating: 0, count: n)
    var latMin = [Float](repeating: .infinity, count: n), latMax = [Float](repeating: -.infinity, count: n)
    var hole = [Int](repeating: 0, count: n)
    var left = [Int](repeating: 0, count: n), leftTop = [Float](repeating: 0, count: n)
    var right = [Int](repeating: 0, count: n), rightTop = [Float](repeating: 0, count: n)
    for p in points {
      let height = p.y - floorY
      let (ahead, lateral) = pose.local(SIMD3(p.x, p.y, p.z))
      guard ahead > 0.05 else { continue }
      let i = min(n - 1, Int(ahead / bin))
      let solid = height >= st.floorTol && height <= st.headTop
      if abs(lateral) <= st.pathHalfWidth {
        if solid && ahead <= st.speakRange + 0.5 {
          path[i] += 1
          pathTop[i] = max(pathTop[i], height)
          latMin[i] = min(latMin[i], lateral); latMax[i] = max(latMax[i], lateral)
        } else if height < -st.floorTol && p.w >= 2 && ahead <= st.speakRange {
          hole[i] += 1 // sunken AND high confidence
        }
      } else if solid && ahead <= st.sideRange && abs(lateral) <= st.pathHalfWidth + st.sideWidth {
        if lateral < 0 { left[i] += 1; leftTop[i] = max(leftTop[i], height) }
        else { right[i] += 1; rightTop[i] = max(rightTop[i], height) }
      }
    }

    // 4. nearest distance with enough points (two neighbouring steps together, so edges aren't split)
    func nearest(_ b: [Int], need: Int) -> Int? {
      for i in 0..<(b.count - 1) where b[i] + b[i + 1] >= need { return i }
      return nil
    }
    let near = nearest(path, need: st.minPoints)
    var top: Float = 0, span: Float = 0
    if let near {
      var lo = Float.infinity, hi = -Float.infinity
      for i in near..<min(n, near + 6) { // the front 30 cm of that thing
        top = max(top, pathTop[i]); lo = min(lo, latMin[i]); hi = max(hi, latMax[i])
      }
      span = hi - lo
    }
    let fromPlane = planeFloorY != nil
    let holes = hole.reduce(0, +)
    // drop-offs only against a floor ARKit is sure about: a false "drop-off" is the scariest mistake
    let drop = fromPlane && holes >= st.dropMinPoints ? nearest(hole, need: 10).map { Float($0) * bin } : nil
    func side(_ b: [Int], _ tops: [Float]) -> SideResult? {
      guard let i = nearest(b, need: st.minPoints) else { return nil }
      return SideResult(dist: Float(i) * bin, tall: tops[i...min(n - 1, i + 6)].max()! > 1.5)
    }

    return HazardResult(
      dist: near.map { Float($0) * bin }, top: top, wall: top > 1.5 && span > 0.5, drop: drop,
      left: side(left, leftTop), right: side(right, rightTop),
      floorY: floorY, floorFromPlane: fromPlane, pose: pose)
  }

  /// No floor plane yet: floor points all lie the same distance below the phone, so the most
  /// common "drop below the phone" (40 cm .. 2.4 m, up to 4 m ahead) is the floor.
  private func estimateFloor(_ pose: Pose) -> Float? {
    var counts = [Int](repeating: 0, count: 48) // 5 cm steps of drop below the phone
    var total = 0
    for p in points {
      let below = pose.pos.y - p.y
      guard below > 0.4, below < 2.4 else { continue }
      let ahead = pose.local(SIMD3(p.x, p.y, p.z)).ahead
      guard ahead > 0, ahead < 4 else { continue }
      counts[Int(below / 0.05)] += 1
      total += 1
    }
    guard let best = counts.indices.max(by: { counts[$0] < counts[$1] }),
          counts[best] >= 100, Float(counts[best]) >= Float(total) * 0.15 else { return nil }
    return pose.pos.y - (Float(best) + 0.5) * 0.05
  }

  /// World position of a detected box (normalized, upright portrait, top-left origin):
  /// the median depth of its middle half, so background showing at the edges doesn't count.
  func locate(_ box: CGRect, in s: DepthSnapshot) -> SIMD3<Float>? {
    withDepth(s) { (w, h, depth, conf) -> SIMD3<Float>? in
      // upright portrait (x, y) -> raw landscape depth pixel: u = y, v = 1 - x (orientation .right)
      let u0 = Int((box.minY + box.height * 0.25) * CGFloat(w)), u1 = Int((box.maxY - box.height * 0.25) * CGFloat(w))
      let v0 = Int((1 - box.maxX + box.width * 0.25) * CGFloat(h)), v1 = Int((1 - box.minX - box.width * 0.25) * CGFloat(h))
      let ulo = max(0, u0), uhi = min(w - 1, u1), vlo = max(0, v0), vhi = min(h - 1, v1)
      guard ulo <= uhi, vlo <= vhi else { return nil }
      var ds: [Float] = []
      for v in vlo...vhi {
        for u in ulo...uhi {
          let d = depth(u, v)
          if d > 0.1, d < 5, d.isFinite, conf(u, v) >= 1 { ds.append(d) }
        }
      }
      guard ds.count >= 5 else { return nil }
      ds.sort()
      let k = Intrinsics(s, w: w, h: h)
      return worldPoint(Float(u0 + u1) / 2, Float(v0 + v1) / 2, ds[ds.count / 2], k, s.transform)
    }
  }
}
