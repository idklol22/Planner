import Capacitor
import UIKit

/// The web app's screen, with Planner's own native plugin attached.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PlannerNativePlugin())
    }
}
