import Capacitor
import Foundation

@objc(NativeSharePlugin)
public class NativeSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeSharePlugin"
    public let jsName = "NativeShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPendingShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPendingShare", returnType: CAPPluginReturnPromise)
    ]

    private let appGroupIdentifier = "group.com.danzai.mianleme"
    private let textKey = "pendingSharedText"
    private let imageKey = "pendingSharedImageBase64"

    @objc func getPendingShare(_ call: CAPPluginCall) {
        let defaults = sharedDefaults()
        call.resolve([
            "text": defaults.string(forKey: textKey) ?? "",
            "imageBase64": defaults.string(forKey: imageKey) ?? ""
        ])
    }

    @objc func clearPendingShare(_ call: CAPPluginCall) {
        let defaults = sharedDefaults()
        defaults.removeObject(forKey: textKey)
        defaults.removeObject(forKey: imageKey)
        defaults.synchronize()
        call.resolve()
    }

    private func sharedDefaults() -> UserDefaults {
        UserDefaults(suiteName: appGroupIdentifier) ?? .standard
    }
}
