import ActivityKit
import Capacitor
import Foundation

@objc(NativeLiveActivityPlugin)
public class NativeLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeLiveActivityPlugin"
    public let jsName = "NativeLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise)
    ]

    @objc func sync(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["active": false, "reason": "unsupported"])
            return
        }

        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            Task { await endAllActivities() }
            call.resolve(["active": false, "reason": "disabled"])
            return
        }

        guard let raw = call.getObject("activity"),
              let interviewId = raw["interviewId"] as? String,
              let state = makeContentState(raw),
              let interviewDate = parseISODate(state.interviewDate),
              interviewDate > Date() else {
            Task { await endAllActivities() }
            call.resolve(["active": false])
            return
        }

        Task {
            await syncActivity(interviewId: interviewId, state: state)
            call.resolve(["active": true])
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["ended": true])
            return
        }

        Task {
            await endAllActivities()
            call.resolve(["ended": true])
        }
    }

    @available(iOS 16.1, *)
    private func syncActivity(interviewId: String, state: MianlemeLiveActivityAttributes.ContentState) async {
        let activities = Activity<MianlemeLiveActivityAttributes>.activities
        for activity in activities where activity.attributes.interviewId != interviewId {
            await activity.end(using: nil, dismissalPolicy: .immediate)
        }

        if let activity = activities.first(where: { $0.attributes.interviewId == interviewId }) {
            await activity.update(using: state)
            return
        }

        do {
            let attributes = MianlemeLiveActivityAttributes(interviewId: interviewId)
            _ = try Activity.request(
                attributes: attributes,
                contentState: state,
                pushType: nil
            )
        } catch {
            print("Mianleme live activity request failed: \(error.localizedDescription)")
        }
    }

    @available(iOS 16.1, *)
    private func endAllActivities() async {
        for activity in Activity<MianlemeLiveActivityAttributes>.activities {
            await activity.end(using: nil, dismissalPolicy: .immediate)
        }
    }

    @available(iOS 16.1, *)
    private func makeContentState(_ raw: JSObject) -> MianlemeLiveActivityAttributes.ContentState? {
        guard let company = raw["company"] as? String,
              let role = raw["role"] as? String,
              let stage = raw["stage"] as? String,
              let interviewDate = raw["interviewDate"] as? String,
              let lang = raw["lang"] as? String else {
            return nil
        }

        return MianlemeLiveActivityAttributes.ContentState(
            company: company,
            role: role,
            stage: stage,
            interviewDate: interviewDate,
            meetingId: raw["meetingId"] as? String ?? "",
            platform: raw["platform"] as? String ?? "",
            link: raw["link"] as? String ?? "",
            lang: lang
        )
    }

    private func staleDate(from value: String) -> Date? {
        guard let date = parseISODate(value) else { return nil }
        return Calendar.current.date(byAdding: .minute, value: 10, to: date)
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
