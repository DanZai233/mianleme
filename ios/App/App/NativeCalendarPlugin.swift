import Capacitor
import EventKit
import EventKitUI
import Foundation
import UIKit

@objc(NativeCalendarPlugin)
public class NativeCalendarPlugin: CAPPlugin, CAPBridgedPlugin, EKEventEditViewDelegate {
    public let identifier = "NativeCalendarPlugin"
    public let jsName = "NativeCalendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "addEvent", returnType: CAPPluginReturnPromise)
    ]

    private let eventStore = EKEventStore()
    private var pendingCall: CAPPluginCall?

    @objc func addEvent(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.presentEventEditor(call)
        }
    }

    private func presentEventEditor(_ call: CAPPluginCall) {
        guard pendingCall == nil else {
            call.reject("calendar-editor-already-open")
            return
        }

        do {
            let event = try buildEvent(call)
            guard let presentingViewController = currentPresentingViewController() else {
                call.reject("calendar-presenter-unavailable")
                return
            }

            let editor = EKEventEditViewController()
            editor.eventStore = eventStore
            editor.event = event
            editor.editViewDelegate = self

            pendingCall = call
            presentingViewController.present(editor, animated: true)
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    private func buildEvent(_ call: CAPPluginCall) throws -> EKEvent {
        guard let title = call.getString("title"), !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw CalendarPluginError.invalidTitle
        }
        guard let startDateValue = call.getString("startDate"),
              let endDateValue = call.getString("endDate"),
              let startDate = parseISODate(startDateValue),
              let endDate = parseISODate(endDateValue),
              endDate > startDate else {
            throw CalendarPluginError.invalidDate
        }

        let event = EKEvent(eventStore: eventStore)
        if let defaultCalendar = eventStore.defaultCalendarForNewEvents {
            event.calendar = defaultCalendar
        }
        event.title = title
        event.notes = call.getString("notes") ?? ""
        event.location = call.getString("location") ?? ""
        event.startDate = startDate
        event.endDate = endDate
        if let timeZoneIdentifier = call.getString("timezone"),
           let timeZone = TimeZone(identifier: timeZoneIdentifier) {
            event.timeZone = timeZone
        }

        let reminderMinutes = max(0, call.getInt("reminderMinutes") ?? 0)
        if reminderMinutes > 0 {
            event.addAlarm(EKAlarm(relativeOffset: TimeInterval(-reminderMinutes * 60)))
        }

        return event
    }

    private func currentPresentingViewController() -> UIViewController? {
        if let bridgeViewController = bridge?.viewController {
            return topViewController(from: bridgeViewController)
        }

        let foregroundScene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        let rootViewController = foregroundScene?.windows
            .first { $0.isKeyWindow }?
            .rootViewController

        return topViewController(from: rootViewController)
    }

    private func topViewController(from viewController: UIViewController?) -> UIViewController? {
        if let navigationController = viewController as? UINavigationController {
            return topViewController(from: navigationController.visibleViewController)
        }

        if let tabBarController = viewController as? UITabBarController {
            return topViewController(from: tabBarController.selectedViewController)
        }

        if let presentedViewController = viewController?.presentedViewController {
            return topViewController(from: presentedViewController)
        }

        return viewController
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

    public func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
        let actionName: String
        switch action {
        case .saved:
            actionName = "saved"
        case .canceled:
            actionName = "canceled"
        case .deleted:
            actionName = "deleted"
        @unknown default:
            actionName = "unknown"
        }

        let eventIdentifier = controller.event?.eventIdentifier ?? ""
        controller.dismiss(animated: true) { [weak self] in
            self?.pendingCall?.resolve([
                "action": actionName,
                "eventIdentifier": eventIdentifier
            ])
            self?.pendingCall = nil
        }
    }
}

private enum CalendarPluginError: LocalizedError {
    case invalidTitle
    case invalidDate

    var errorDescription: String? {
        switch self {
        case .invalidTitle:
            return "calendar-invalid-title"
        case .invalidDate:
            return "calendar-invalid-date"
        }
    }
}
