// Camera preview + ARKit session. Everything heavy happens here, natively; JS only gets
// small results (distances, names) to speak and draw.
import ARKit
import ExpoModulesCore

/// A detection, placed in the world, so it stays put while the phone moves.
private struct Seen {
  let name: String
  let conf: Float
  let box: CGRect
  let world: SIMD3<Float>?
}

final class SafeStepARView: ExpoView, ARSessionDelegate {
  let onHazard = EventDispatcher()
  let onObjects = EventDispatcher()
  let onStatus = EventDispatcher()

  private let sceneView = ARSCNView()
  private let queue = DispatchQueue(label: "safestep.ar", qos: .userInteractive) // all state below lives here
  private let engine = HazardEngine()
  private let detector = Detector()

  private var active = false // main thread
  private var running = false // main thread

  private var important = Set<String>()
  private var detectorReady = false
  private var detecting = false
  private var seen: [Seen] = []
  private var seenAt: CFTimeInterval = 0
  private var detectorMs: Double = 0
  private var lastHazard: TimeInterval = 0
  private var tracking = "starting"

  private static let hazardEvery: TimeInterval = 0.08 // ~12 checks per second
  private static let seenFor: CFTimeInterval = 1.0     // a detection names an obstacle for up to 1 s

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    sceneView.automaticallyUpdatesLighting = false
    sceneView.rendersCameraGrain = false
    sceneView.session.delegate = self
    sceneView.session.delegateQueue = queue
    addSubview(sceneView)

    detector.log = { [weak self] message in self?.status(message) }
    detector.load { [weak self] ok in
      guard let self else { return }
      self.queue.async { self.detectorReady = ok }
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    sceneView.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    updateSession()
  }

  // MARK: props (main thread)

  func setActive(_ value: Bool) {
    active = value
    updateSession()
  }

  func setSettings(_ values: [String: Double]) {
    let settings = HazardSettings(values)
    queue.async { self.engine.settings = settings }
  }

  func setClasses(names: [String], important: [String], minConf: Double) {
    detector.configure(names: names, minConf: Float(minConf))
    let set = Set(important)
    queue.async { self.important = set }
  }

  private func updateSession() {
    let shouldRun = active && window != nil
    guard shouldRun != running else { return }
    running = shouldRun
    if shouldRun {
      let config = ARWorldTrackingConfiguration() // gravity-aligned: y is up
      config.planeDetection = [.horizontal]
      if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
        config.frameSemantics.insert(.smoothedSceneDepth)
      }
      sceneView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
      status("AR: session started (LiDAR depth \(config.frameSemantics.contains(.smoothedSceneDepth)))")
    } else {
      sceneView.session.pause()
    }
  }

  private func status(_ message: String) {
    DispatchQueue.main.async { self.onStatus(["message": message]) }
  }

  // MARK: ARSessionDelegate (on `queue`)

  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    guard let depth = frame.smoothedSceneDepth ?? frame.sceneDepth else { return }
    let snap = DepthSnapshot(depth: depth.depthMap, confidence: depth.confidenceMap,
                             transform: frame.camera.transform, intrinsics: frame.camera.intrinsics,
                             imageSize: frame.camera.imageResolution)

    // names: start the next detection as soon as the last one is done (never waits for, or blocks, hazards)
    if detectorReady && !detecting {
      detecting = true
      detector.detect(frame.capturedImage) { [weak self] found, ms in
        self?.queue.async { self?.detected(found, ms, snap) }
      }
    }

    guard frame.timestamp - lastHazard >= SafeStepARView.hazardEvery else { return }
    lastHazard = frame.timestamp
    let t0 = CACurrentMediaTime()
    let r = engine.analyze(snap, planeFloorY: floorPlane(frame.anchors, phoneY: snap.transform.columns.3.y))
    let ms = (CACurrentMediaTime() - t0) * 1000
    sendHazard(r, ms: ms)
  }

  func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
    switch camera.trackingState {
    case .normal: tracking = "normal"
    case .notAvailable: tracking = "not available"
    case .limited(.initializing): tracking = "starting"
    case .limited(.excessiveMotion): tracking = "moving too fast"
    case .limited(.insufficientFeatures): tracking = "too dark or plain"
    case .limited: tracking = "limited"
    }
    status("AR: tracking \(tracking)")
  }

  func session(_ session: ARSession, didFailWithError error: Error) {
    DispatchQueue.main.async {
      self.running = false
      self.onStatus(["message": "AR: failed: \(error.localizedDescription)", "error": true])
    }
  }

  // MARK: results

  /// ARKit's floor: prefer planes it classified as floor, else the lowest big flat surface below the phone.
  private func floorPlane(_ anchors: [ARAnchor], phoneY: Float) -> Float? {
    var best: (y: Float, score: Float)?
    for case let plane as ARPlaneAnchor in anchors where plane.alignment == .horizontal {
      let y = plane.transform.columns.3.y
      guard phoneY - y > 0.4, phoneY - y < 2.4 else { continue }
      var isFloor = false
      if ARPlaneAnchor.isClassificationSupported, case .floor = plane.classification { isFloor = true }
      let area = plane.planeExtent.width * plane.planeExtent.height
      guard isFloor || area > 0.5 else { continue }
      let score = (isFloor ? 1000 : 0) - y * 10 + min(area, 5)
      if best == nil || score > best!.score { best = (y, score) }
    }
    return best?.y
  }

  private func detected(_ found: [Found], _ ms: Double, _ snap: DepthSnapshot) {
    detecting = false
    detectorMs = ms
    seen = found.filter { important.contains($0.name) }.map {
      Seen(name: $0.name, conf: $0.conf, box: $0.box, world: engine.locate($0.box, in: snap))
    }
    seenAt = CACurrentMediaTime()

    let pose = Pose(snap.transform, fallback: SIMD2(0, -1))
    let objects: [[String: Any]] = seen.map { s in
      var o: [String: Any] = [
        "name": s.name, "conf": s.conf,
        "x1": s.box.minX, "y1": s.box.minY, "x2": s.box.maxX, "y2": s.box.maxY,
      ]
      if let w = s.world {
        let (ahead, lateral) = pose.local(w)
        o["dist"] = (ahead * ahead + lateral * lateral).squareRoot()
        o["lateral"] = lateral
      }
      return o
    }
    DispatchQueue.main.async { self.onObjects(["objects": objects, "ms": ms]) }
  }

  /// Name of the closest recent detection near (ahead, within lateral range) of the phone, if any.
  private func nameNear(_ ahead: Float, _ lateral: ClosedRange<Float>, _ pose: Pose) -> String? {
    guard CACurrentMediaTime() - seenAt < SafeStepARView.seenFor else { return nil }
    var best: (name: String, ahead: Float)?
    for s in seen {
      guard let w = s.world else { continue }
      let (a, l) = pose.local(w)
      guard lateral.contains(l), abs(a - ahead) < 0.6 else { continue }
      if best == nil || a < best!.ahead { best = (s.name, a) }
    }
    return best?.name
  }

  private func sendHazard(_ r: HazardResult, ms: Double) {
    let st = engine.settings
    let half = st.pathHalfWidth, outer = st.pathHalfWidth + st.sideWidth + 0.3
    var label = ""
    if let d = r.dist {
      label = nameNear(d, -(half + 0.3)...(half + 0.3), r.pose)
        ?? (r.wall ? "wall" : r.top < st.lowTop ? "low obstacle" : "")
    }
    func side(_ s: SideResult?, _ range: ClosedRange<Float>) -> String {
      guard let s else { return "" }
      return nameNear(s.dist, range, r.pose) ?? (s.tall ? "wall" : "object")
    }
    let payload: [String: Any] = [
      "dist": r.dist ?? 99, // 99 = path clear
      "label": label,
      "left": side(r.left, -outer...(-half + 0.1)),
      "right": side(r.right, (half - 0.1)...outer),
      "drop": r.drop ?? -1,
      "phoneHeight": r.pose.pos.y - r.floorY,
      "floorFound": r.floorFromPlane,
      "tracking": tracking,
      "ms": ms,
      "detectorMs": detectorMs,
    ]
    DispatchQueue.main.async { self.onHazard(payload) }
  }
}
