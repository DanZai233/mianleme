import Capacitor
import Foundation
import UserNotifications

@objc(NativeReminderPlugin)
public class NativeReminderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeReminderPlugin"
    public let jsName = "NativeReminder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReminderPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise)
    ]

    private let center = UNUserNotificationCenter.current()
    private let managedPrefix = "mianleme_"

    @objc func requestReminderPermissions(_ call: CAPPluginCall) {
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["granted": granted])
        }
    }

    @objc func sync(_ call: CAPPluginCall) {
        guard let notifications = call.getArray("notifications", JSObject.self) else {
            call.reject("Invalid notifications")
            return
        }

        center.getNotificationSettings { [weak self] settings in
            guard let self else { return }
            guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
                call.reject("notification permission denied")
                return
            }

            self.center.getPendingNotificationRequests { pending in
                let managedIds = pending.map(\.identifier).filter { $0.hasPrefix(self.managedPrefix) }
                self.center.removePendingNotificationRequests(withIdentifiers: managedIds)

                var scheduled = 0
                for notification in notifications {
                    guard let request = self.makeRequest(notification) else { continue }
                    self.center.add(request)
                    scheduled += 1
                }
                call.resolve(["scheduled": scheduled])
            }
        }
    }

    private func makeRequest(_ raw: JSObject) -> UNNotificationRequest? {
        guard let id = raw["id"] as? String,
              let title = raw["title"] as? String,
              let body = raw["body"] as? String,
              let dateValue = raw["date"] as? String,
              let date = parseISODate(dateValue),
              date > Date() else {
            return nil
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        return UNNotificationRequest(identifier: id, content: content, trigger: trigger)
    }

    private func parseISODate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) {
            return date
        }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}
