import Capacitor
import UIKit

@objc(MainViewController)
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()

        bridge?.registerPluginInstance(NativeCalendarPlugin())
        bridge?.registerPluginInstance(NativeReminderPlugin())
        bridge?.registerPluginInstance(NativeWidgetPlugin())
        bridge?.registerPluginInstance(NativeSharePlugin())
    }
}
