import Capacitor
import EventKit
import EventKitUI
import Foundation

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
        if #available(iOS 17.0, *) {
            DispatchQueue.main.async { [weak self] in
                self?.presentEventEditor(call)
            }
            return
        }

        requestCalendarAccess { [weak self] granted, error in
            guard let self else { return }
            if let error {
                call.reject(error.localizedDescription)
                return
            }
            guard granted else {
                call.reject("calendar permission denied")
                return
            }

            do {
                let identifier = try self.saveEvent(call)
                call.resolve(["eventIdentifier": identifier ?? ""])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    private func requestCalendarAccess(completion: @escaping (Bool, Error?) -> Void) {
        if #available(iOS 17.0, *) {
            eventStore.requestWriteOnlyAccessToEvents(completion: completion)
        } else {
            eventStore.requestAccess(to: .event, completion: completion)
        }
    }

    @available(iOS 17.0, *)
    private func presentEventEditor(_ call: CAPPluginCall) {
        guard pendingCall == nil else {
            call.reject("calendar editor already open")
            return
        }

        do {
            let event = try buildEvent(call)
            guard let presentingViewController = bridge?.viewController else {
                call.reject("calendar presenter unavailable")
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

    private func saveEvent(_ call: CAPPluginCall) throws -> String? {
        let event = try buildEvent(call)
        guard event.calendar != nil else {
            throw CalendarPluginError.noDefaultCalendar
        }

        try eventStore.save(event, span: .thisEvent, commit: true)
        return event.eventIdentifier
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
        event.calendar = eventStore.defaultCalendarForNewEvents
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
    case noDefaultCalendar

    var errorDescription: String? {
        switch self {
        case .invalidTitle:
            return "Invalid event title"
        case .invalidDate:
            return "Invalid event date"
        case .noDefaultCalendar:
            return "No default calendar is available"
        }
    }
}
