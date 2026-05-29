import ActivityKit
import SwiftUI
import WidgetKit

@available(iOSApplicationExtension 16.1, *)
struct MianlemeLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MianlemeLiveActivityAttributes.self) { context in
            MianlemeLiveActivityLockScreenView(state: context.state)
                .activityBackgroundTint(Color(red: 0.07, green: 0.08, blue: 0.10))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.state.company)
                            .font(.headline.weight(.bold))
                            .lineLimit(1)
                        Text(context.state.role)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .dynamicIsland(verticalPlacement: .belowIfTooWide)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        liveActivityCountdownView(context.state.interviewDate, lang: context.state.lang)
                            .font(.headline.weight(.bold))
                            .lineLimit(1)
                        Text(liveActivityShortDateText(context.state.interviewDate, lang: context.state.lang))
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 8) {
                        Label(liveActivityStageText(context.state.stage, lang: context.state.lang), systemImage: "person.crop.circle.badge.clock")
                        if !context.state.meetingId.isEmpty {
                            Label(context.state.meetingId, systemImage: "number")
                        }
                        Spacer(minLength: 0)
                    }
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                }
            } compactLeading: {
                Text(context.state.company.prefix(2))
                    .font(.caption.weight(.bold))
                    .minimumScaleFactor(0.7)
            } compactTrailing: {
                liveActivityCompactCountdownView(context.state.interviewDate)
                    .font(.caption2.weight(.bold))
                    .minimumScaleFactor(0.7)
            } minimal: {
                Image(systemName: "calendar")
                    .font(.caption.weight(.bold))
            }
            .keylineTint(Color(red: 0.35, green: 0.62, blue: 1.0))
        }
    }
}

@available(iOSApplicationExtension 16.1, *)
private struct MianlemeLiveActivityLockScreenView: View {
    let state: MianlemeLiveActivityAttributes.ContentState

    private var isChinese: Bool {
        state.lang == "zh"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color(red: 0.35, green: 0.62, blue: 1.0).opacity(0.18))
                    Image(systemName: "calendar.badge.clock")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(Color(red: 0.60, green: 0.76, blue: 1.0))
                }
                .frame(width: 42, height: 42)

                VStack(alignment: .leading, spacing: 4) {
                    Text(state.company)
                        .font(.system(size: 21, weight: .bold, design: .rounded))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Text(state.role)
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 3) {
                    liveActivityCountdownView(state.interviewDate, lang: state.lang)
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundStyle(Color(red: 0.60, green: 0.76, blue: 1.0))
                        .lineLimit(1)
                    Text(liveActivityShortDateText(state.interviewDate, lang: state.lang))
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            HStack(spacing: 8) {
                liveActivityChip(liveActivityStageText(state.stage, lang: state.lang), systemImage: "person.fill")
                if !state.meetingId.isEmpty {
                    liveActivityChip("\(isChinese ? "会议号" : "ID") \(state.meetingId)", systemImage: "number")
                }
                if !state.platform.isEmpty {
                    liveActivityChip(state.platform, systemImage: "video.fill")
                }
            }

            if !state.link.isEmpty {
                Text(state.link)
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(18)
        .foregroundStyle(.white)
    }

    private func liveActivityChip(_ text: String, systemImage: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .lineLimit(1)
            .minimumScaleFactor(0.78)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.white.opacity(0.10), in: Capsule())
            .overlay(Capsule().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
    }
}

private func liveActivityDate(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) {
        return date
    }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
}

private func liveActivityShortDateText(_ value: String, lang: String) -> String {
    guard let date = liveActivityDate(value) else {
        return lang == "zh" ? "待定" : "TBD"
    }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: lang == "zh" ? "zh_CN" : "en_US")
    if Calendar.current.isDateInToday(date) {
        formatter.dateFormat = lang == "zh" ? "今天 HH:mm" : "'Today' HH:mm"
    } else if Calendar.current.isDateInTomorrow(date) {
        formatter.dateFormat = lang == "zh" ? "明天 HH:mm" : "'Tomorrow' HH:mm"
    } else {
        formatter.dateFormat = lang == "zh" ? "M月d日 HH:mm" : "MMM d, HH:mm"
    }
    return formatter.string(from: date)
}

private func liveActivityCountdownText(_ value: String, lang: String) -> String {
    guard let date = liveActivityDate(value) else {
        return lang == "zh" ? "待确认" : "Pending"
    }
    let seconds = Int(date.timeIntervalSince(Date()))
    if seconds < -60 {
        return lang == "zh" ? "待更新" : "Update"
    }
    if seconds < 60 {
        return lang == "zh" ? "马上开始" : "Soon"
    }
    let minutes = seconds / 60
    if minutes < 60 {
        return lang == "zh" ? "\(minutes) 分钟后" : "in \(minutes)m"
    }
    let hours = minutes / 60
    if hours < 24 {
        return lang == "zh" ? "\(hours) 小时后" : "in \(hours)h"
    }
    let days = hours / 24
    return lang == "zh" ? "\(days) 天后" : "in \(days)d"
}

private func liveActivityCountdownView(_ value: String, lang: String) -> Text {
    guard let date = liveActivityDate(value) else {
        return Text(lang == "zh" ? "待确认" : "Pending")
    }
    let seconds = Int(date.timeIntervalSince(Date()))
    if seconds < -60 {
        return Text(lang == "zh" ? "待更新" : "Update")
    }
    if seconds < 60 {
        return Text(lang == "zh" ? "马上开始" : "Soon")
    }
    return Text(date, style: .timer)
}

private func liveActivityCompactCountdownText(_ value: String) -> String {
    guard let date = liveActivityDate(value) else { return "?" }
    let seconds = Int(date.timeIntervalSince(Date()))
    if seconds < 60 { return "now" }
    if seconds < 3600 { return "\(max(1, seconds / 60))m" }
    if seconds < 86400 { return "\(seconds / 3600)h" }
    return "\(seconds / 86400)d"
}

private func liveActivityCompactCountdownView(_ value: String) -> Text {
    guard let date = liveActivityDate(value) else { return Text("?") }
    let seconds = Int(date.timeIntervalSince(Date()))
    if seconds < 60 { return Text("now") }
    if seconds < 3600 { return Text(date, style: .timer) }
    return Text(liveActivityCompactCountdownText(value))
}

private func liveActivityStageText(_ value: String, lang: String) -> String {
    switch value {
    case "applied":
        return lang == "zh" ? "已投递" : "Applied"
    case "hr":
        return lang == "zh" ? "HR 初筛" : "HR"
    case "technical1":
        return lang == "zh" ? "技术一面" : "Tech I"
    case "technical2":
        return lang == "zh" ? "技术二面" : "Tech II"
    case "final":
        return lang == "zh" ? "终面" : "Final"
    case "offerTalk":
        return lang == "zh" ? "Offer 沟通" : "Offer"
    case "closed":
        return lang == "zh" ? "已结束" : "Closed"
    default:
        return lang == "zh" ? "面试" : "Interview"
    }
}
