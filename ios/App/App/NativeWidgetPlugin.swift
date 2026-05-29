import Capacitor
import Foundation
import WidgetKit

@objc(NativeWidgetPlugin)
public class NativeWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeWidgetPlugin"
    public let jsName = "NativeWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateSnapshot", returnType: CAPPluginReturnPromise)
    ]

    private let appGroupIdentifier = "group.com.danzai.mianleme"
    private let snapshotKey = "nextInterviewWidget"

    @objc func updateSnapshot(_ call: CAPPluginCall) {
        guard let snapshot = call.getObject("snapshot") else {
            call.reject("Invalid widget snapshot")
            return
        }

        do {
            let data = try JSONSerialization.data(withJSONObject: snapshot, options: [])
            UserDefaults.standard.set(data, forKey: snapshotKey)
            guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
                call.reject("widget-app-group-unavailable")
                return
            }

            sharedDefaults.set(data, forKey: snapshotKey)
            sharedDefaults.synchronize()
            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadAllTimelines()
            }
            call.resolve(["updated": true])
        } catch {
            call.reject(error.localizedDescription)
        }
    }
}
