import ARKit
import ExpoModulesCore

public final class SafeStepARModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SafeStepAR")

    /// true on iPhones/iPads with LiDAR (12 Pro and newer Pro models)
    Function("isSupported") {
      ARWorldTrackingConfiguration.isSupported
        && ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth)
    }

    View(SafeStepARView.self) {
      Events("onHazard", "onObjects", "onStatus")

      Prop("active") { (view: SafeStepARView, active: Bool) in
        view.setActive(active)
      }

      Prop("settings") { (view: SafeStepARView, settings: [String: Double]) in
        view.setSettings(settings)
      }

      Prop("classes") { (view: SafeStepARView, classes: [String: Any]) in
        view.setClasses(
          names: classes["names"] as? [String] ?? [],
          important: classes["important"] as? [String] ?? [],
          minConf: classes["minConf"] as? Double ?? 0.5)
      }
    }
  }
}
