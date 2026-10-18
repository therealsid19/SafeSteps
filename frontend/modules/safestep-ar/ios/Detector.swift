// yolo26n on the Neural Engine (CoreML through Apple's Vision). Runs on its own queue, separate
// from the hazard check, so a slow detection never delays a warning: names arrive a little later.
import CoreML
import Vision

/// One detected thing. box: normalized 0..1, upright portrait picture, top-left origin.
struct Found {
  let name: String
  let conf: Float
  let box: CGRect
}

final class Detector {
  private let queue = DispatchQueue(label: "safestep.detector", qos: .userInitiated)
  private var request: VNCoreMLRequest?
  private var inputSize = CGSize(width: 640, height: 640)
  private var names: [String] = []
  private var minConf: Float = 0.25
  private var loggedShape = false
  var log: (String) -> Void = { _ in }

  func configure(names: [String], minConf: Float) {
    queue.async {
      self.names = names
      self.minConf = minConf
    }
  }

  /// Loads the bundled model once. done(true) when detections can start.
  func load(_ done: @escaping (Bool) -> Void) {
    queue.async {
      do {
        guard let url = try Detector.compiledModelURL() else {
          self.log("detector: no yolo26n model in the app (see modules/safestep-ar/README.md): warnings work, names are off")
          done(false)
          return
        }
        let cfg = MLModelConfiguration()
        cfg.computeUnits = .all // Neural Engine when it can
        let model = try MLModel(contentsOf: url, configuration: cfg)
        if let c = model.modelDescription.inputDescriptionsByName.values.first?.imageConstraint {
          self.inputSize = CGSize(width: c.pixelsWide, height: c.pixelsHigh)
        }
        let request = VNCoreMLRequest(model: try VNCoreMLModel(for: model))
        request.imageCropAndScaleOption = .scaleFit // letterbox like ultralytics: no stretching
        self.request = request
        self.log("detector: yolo26n ready, input \(Int(self.inputSize.width))x\(Int(self.inputSize.height))")
        done(true)
      } catch {
        self.log("detector: failed to load (\(error.localizedDescription)): names are off")
        done(false)
      }
    }
  }

  /// A compiled .mlmodelc if the app has one, else compile the bundled .mlpackage once and cache it.
  private static func compiledModelURL() throws -> URL? {
    let bundles = [Bundle(for: Detector.self), Bundle.main]
    for b in bundles {
      if let url = b.url(forResource: "yolo26n", withExtension: "mlmodelc") { return url }
    }
    guard let pkg = bundles.lazy.compactMap({ $0.url(forResource: "yolo26n", withExtension: "mlpackage") }).first else {
      return nil
    }
    let fm = FileManager.default
    let attrs = try? fm.attributesOfItem(atPath: pkg.path)
    let stamp = Int((attrs?[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0) // new model = recompile
    let cache = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      .appendingPathComponent("yolo26n-\(stamp).mlmodelc")
    if fm.fileExists(atPath: cache.path) { return cache }
    let compiled = try MLModel.compileModel(at: pkg)
    try? fm.removeItem(at: cache)
    try fm.moveItem(at: compiled, to: cache)
    return cache
  }

  /// image: ARKit's camera picture (landscape sensor buffer). done gets the boxes + how long it took.
  func detect(_ image: CVPixelBuffer, _ done: @escaping ([Found], Double) -> Void) {
    queue.async {
      guard let request = self.request else { return done([], 0) }
      let t0 = CACurrentMediaTime()
      // .right = the sensor picture turned upright for a phone held in portrait
      let handler = VNImageRequestHandler(cvPixelBuffer: image, orientation: .right)
      var found: [Found] = []
      do {
        try handler.perform([request])
        found = self.parse(request.results ?? [],
                           imageW: CVPixelBufferGetHeight(image), imageH: CVPixelBufferGetWidth(image)) // upright size
      } catch {
        self.log("detector: \(error.localizedDescription)")
      }
      done(found, (CACurrentMediaTime() - t0) * 1000)
    }
  }

  private func parse(_ results: [VNObservation], imageW: Int, imageH: Int) -> [Found] {
    // a model exported with NMS: Vision already made the boxes
    if let objects = results as? [VNRecognizedObjectObservation] {
      return objects.compactMap { o in
        guard let top = o.labels.first, top.confidence >= minConf else { return nil }
        let b = o.boundingBox // bottom-left origin
        return Found(name: top.identifier, conf: top.confidence,
                     box: CGRect(x: b.minX, y: 1 - b.maxY, width: b.width, height: b.height))
      }
    }
    // end-to-end YOLO (yolo26): (1, N, 6) rows of [x1, y1, x2, y2, score, class] in model-input pixels
    guard let out = (results.first as? VNCoreMLFeatureValueObservation)?.featureValue.multiArrayValue else { return [] }
    let shape = out.shape.map(\.intValue)
    if !loggedShape {
      log("detector: output shape \(shape)")
      loggedShape = true
    }
    guard shape.count == 3, shape[2] == 6 || shape[1] == 6 else { return [] }
    let rowsFirst = shape[2] == 6
    let rows = rowsFirst ? shape[1] : shape[2]
    func at(_ r: Int, _ k: Int) -> Float {
      let row = NSNumber(value: r), col = NSNumber(value: k)
      let index: [NSNumber] = rowsFirst ? [0, row, col] : [0, col, row]
      return out[index].floatValue
    }
    // undo the letterbox: where the picture sits inside the square model input
    let s = min(inputSize.width / CGFloat(imageW), inputSize.height / CGFloat(imageH))
    let cw = CGFloat(imageW) * s, ch = CGFloat(imageH) * s
    let px = (inputSize.width - cw) / 2, py = (inputSize.height - ch) / 2
    func nx(_ v: Float) -> CGFloat { min(max((CGFloat(v) - px) / cw, 0), 1) }
    func ny(_ v: Float) -> CGFloat { min(max((CGFloat(v) - py) / ch, 0), 1) }

    var found: [Found] = []
    for r in 0..<rows {
      let conf = at(r, 4)
      guard conf >= minConf else { continue }
      let cls = Int(at(r, 5).rounded())
      let name = cls >= 0 && cls < names.count ? names[cls] : "class \(cls)"
      let x1 = nx(at(r, 0)), y1 = ny(at(r, 1)), x2 = nx(at(r, 2)), y2 = ny(at(r, 3))
      guard x2 > x1, y2 > y1 else { continue }
      found.append(Found(name: name, conf: conf, box: CGRect(x: x1, y: y1, width: x2 - x1, height: y2 - y1)))
    }
    return found
  }
}
