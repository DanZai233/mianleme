import SwiftUI
import WidgetKit

private struct InterviewSnapshot: Decodable {
    let hasInterview: Bool
    let company: String
    let role: String
    let stage: String
    let date: String
    let meetingId: String
    let lang: String

    enum CodingKeys: String, CodingKey {
        case hasInterview
        case company
        case role
        case stage
        case date
        case meetingId
        case lang
    }

    init(
        hasInterview: Bool,
        company: String,
        role: String,
        stage: String,
        date: String,
        meetingId: String,
        lang: String
    ) {
        self.hasInterview = hasInterview
        self.company = company
        self.role = role
        self.stage = stage
        self.date = date
        self.meetingId = meetingId
        self.lang = lang
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        company = try container.decodeIfPresent(String.self, forKey: .company) ?? ""
        role = try container.decodeIfPresent(String.self, forKey: .role) ?? ""
        stage = try container.decodeIfPresent(String.self, forKey: .stage) ?? ""
        date = try container.decodeIfPresent(String.self, forKey: .date) ?? ""
        meetingId = try container.decodeIfPresent(String.self, forKey: .meetingId) ?? ""
        lang = try container.decodeIfPresent(String.self, forKey: .lang) ?? "zh"
        hasInterview = try container.decodeIfPresent(Bool.self, forKey: .hasInterview) ?? (!company.isEmpty || !date.isEmpty)
    }
}

private struct InterviewEntry: TimelineEntry {
    let date: Date
    let snapshot: InterviewSnapshot
}

private struct Provider: TimelineProvider {
    private let appGroupIdentifier = "group.com.danzai.mianleme"
    private let snapshotKey = "nextInterviewWidget"

    func placeholder(in context: Context) -> InterviewEntry {
        InterviewEntry(
            date: Date(),
            snapshot: InterviewSnapshot(
                hasInterview: true,
                company: "字节跳动",
                role: "前端工程师",
                stage: "technical1",
                date: Date().addingTimeInterval(3600).iso8601String,
                meetingId: "123 456 789",
                lang: "zh"
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (InterviewEntry) -> Void) {
        completion(InterviewEntry(date: Date(), snapshot: loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<InterviewEntry>) -> Void) {
        let entry = InterviewEntry(date: Date(), snapshot: loadSnapshot())
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }

    private func loadSnapshot() -> InterviewSnapshot {
        let defaults = UserDefaults(suiteName: appGroupIdentifier) ?? .standard
        if let data = defaults.data(forKey: snapshotKey),
           let snapshot = try? JSONDecoder().decode(InterviewSnapshot.self, from: data) {
            return snapshot
        }
        return InterviewSnapshot(hasInterview: false, company: "", role: "暂无待进行面试", stage: "", date: "", meetingId: "", lang: "zh")
    }
}

private struct MianlemeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Provider.Entry

    private var isEmpty: Bool {
        !entry.snapshot.hasInterview
    }

    private var startDate: Date? {
        ISO8601DateFormatter().date(from: entry.snapshot.date)
    }

    private var isChinese: Bool {
        entry.snapshot.lang == "zh"
    }

    private var dateText: String {
        guard let date = startDate else { return isChinese ? "时间待定" : "Time TBD" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: isChinese ? "zh_CN" : "en_US")
        if Calendar.current.isDateInToday(date) {
            formatter.dateFormat = isChinese ? "今天 HH:mm" : "'Today' HH:mm"
        } else if Calendar.current.isDateInTomorrow(date) {
            formatter.dateFormat = isChinese ? "明天 HH:mm" : "'Tomorrow' HH:mm"
        } else {
            formatter.dateFormat = isChinese ? "M月d日 HH:mm" : "MMM d, HH:mm"
        }
        return formatter.string(from: date)
    }

    private var shortDateText: String {
        guard let date = startDate else { return isChinese ? "待定" : "TBD" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: isChinese ? "zh_CN" : "en_US")
        formatter.dateFormat = Calendar.current.isDateInToday(date) ? "HH:mm" : (isChinese ? "M/d" : "MMM d")
        return formatter.string(from: date)
    }

    private var countdownText: String {
        guard let date = startDate else { return isChinese ? "待确认" : "Pending" }
        let seconds = Int(date.timeIntervalSince(Date()))
        if seconds < -60 {
            return isChinese ? "待更新" : "Update"
        }
        if seconds < 60 {
            return isChinese ? "马上开始" : "Soon"
        }
        let minutes = seconds / 60
        if minutes < 60 {
            return isChinese ? "\(minutes) 分钟后" : "in \(minutes)m"
        }
        let hours = minutes / 60
        if hours < 24 {
            return isChinese ? "\(hours) 小时后" : "in \(hours)h"
        }
        let days = hours / 24
        return isChinese ? "\(days) 天后" : "in \(days)d"
    }

    private var compactCountdownText: String {
        guard let date = startDate else { return isChinese ? "待" : "TBD" }
        let seconds = Int(date.timeIntervalSince(Date()))
        if seconds < -60 { return isChinese ? "更" : "UPD" }
        if seconds < 3600 { return "\(max(1, seconds / 60))m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)d"
    }

    private var stageText: String {
        switch entry.snapshot.stage {
        case "applied":
            return isChinese ? "已投递" : "Applied"
        case "hr":
            return isChinese ? "HR 初筛" : "HR"
        case "technical1":
            return isChinese ? "技术一面" : "Tech I"
        case "technical2":
            return isChinese ? "技术二面" : "Tech II"
        case "final":
            return isChinese ? "终面" : "Final"
        case "offerTalk":
            return isChinese ? "Offer 沟通" : "Offer"
        case "closed":
            return isChinese ? "已结束" : "Closed"
        default:
            return isChinese ? "面试" : "Interview"
        }
    }

    var body: some View {
        if #available(iOSApplicationExtension 16.0, *), family == .accessoryRectangular {
            lockScreenRectangular
        } else if #available(iOSApplicationExtension 16.0, *), family == .accessoryInline {
            lockScreenInline
        } else if #available(iOSApplicationExtension 16.0, *), family == .accessoryCircular {
            lockScreenCircular
        } else {
            homeWidget
        }
    }

    private var homeWidget: some View {
        VStack(alignment: .leading, spacing: family == .systemMedium ? 12 : 9) {
            HStack(spacing: 8) {
                Text("面了么")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundStyle(Color(red: 0.08, green: 0.22, blue: 0.36))
                Spacer(minLength: 4)
                if !isEmpty {
                    Text(countdownText)
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundStyle(Color(red: 0.05, green: 0.35, blue: 0.26))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color(red: 0.80, green: 0.95, blue: 0.88), in: Capsule())
                        .lineLimit(1)
                }
            }

            if isEmpty {
                emptyHomeContent
            } else if family == .systemMedium {
                mediumHomeContent
            } else {
                smallHomeContent
            }
        }
        .padding(family == .systemMedium ? 16 : 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .mianlemeWidgetBackground()
    }

    private var smallHomeContent: some View {
        VStack(alignment: .leading, spacing: 8) {
            Spacer(minLength: 0)
            Text(entry.snapshot.company)
                .font(.system(size: 20, weight: .heavy, design: .rounded))
                .foregroundStyle(Color(red: 0.06, green: 0.08, blue: 0.12))
                .lineLimit(2)
                .minimumScaleFactor(0.78)
            Text(entry.snapshot.role)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(Color(red: 0.34, green: 0.39, blue: 0.46))
                .lineLimit(2)
            HStack(spacing: 6) {
                Text(dateText)
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .foregroundStyle(Color(red: 0.95, green: 0.47, blue: 0.19))
        }
    }

    private var mediumHomeContent: some View {
        HStack(alignment: .bottom, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                Text(entry.snapshot.company)
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .foregroundStyle(Color(red: 0.06, green: 0.08, blue: 0.12))
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
                Text(entry.snapshot.role)
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color(red: 0.34, green: 0.39, blue: 0.46))
                    .lineLimit(1)
                HStack(spacing: 6) {
                    tag(dateText, foreground: Color(red: 0.05, green: 0.31, blue: 0.54), background: Color(red: 0.84, green: 0.93, blue: 1.0))
                    tag(stageText, foreground: Color(red: 0.44, green: 0.29, blue: 0.06), background: Color(red: 1.0, green: 0.91, blue: 0.68))
                }
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 7) {
                Text(isChinese ? "会议号" : "Meeting")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color(red: 0.45, green: 0.50, blue: 0.57))
                Text(entry.snapshot.meetingId.isEmpty ? "--" : entry.snapshot.meetingId)
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Color(red: 0.06, green: 0.08, blue: 0.12))
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
            }
        }
    }

    private var emptyHomeContent: some View {
        VStack(alignment: .leading, spacing: 8) {
            Spacer(minLength: 0)
            Text(isChinese ? "暂无待进行面试" : "No upcoming interviews")
                .font(.system(size: family == .systemMedium ? 22 : 18, weight: .heavy, design: .rounded))
                .foregroundStyle(Color(red: 0.06, green: 0.08, blue: 0.12))
                .lineLimit(2)
            Text(isChinese ? "添加面试后会自动显示下一场" : "Add one in the app and it will appear here")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundStyle(Color(red: 0.36, green: 0.41, blue: 0.48))
                .lineLimit(2)
        }
    }

    private func tag(_ text: String, foreground: Color, background: Color) -> some View {
        Text(text)
            .font(.system(size: 12, weight: .bold, design: .rounded))
            .foregroundStyle(foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(background, in: Capsule())
            .lineLimit(1)
    }

    @available(iOSApplicationExtension 16.0, *)
    private var lockScreenInline: some View {
        Text(isEmpty ? (isChinese ? "面了么：暂无面试" : "MianLeMe: no interviews") : "\(entry.snapshot.company) \(shortDateText)")
    }

    @available(iOSApplicationExtension 16.0, *)
    private var lockScreenCircular: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 1) {
                Text(isEmpty ? "面" : compactCountdownText)
                    .font(.system(size: 16, weight: .heavy, design: .rounded))
                    .minimumScaleFactor(0.65)
                Text(isEmpty ? "" : shortDateText)
                    .font(.system(size: 9, weight: .semibold, design: .rounded))
                    .minimumScaleFactor(0.7)
            }
            .widgetAccentable()
        }
    }

    @available(iOSApplicationExtension 16.0, *)
    private var lockScreenRectangular: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(isEmpty ? (isChinese ? "暂无待进行面试" : "No upcoming interviews") : entry.snapshot.company)
                .font(.headline.weight(.bold))
                .lineLimit(1)
                .widgetAccentable()
            if isEmpty {
                Text(isChinese ? "打开面了么添加下一场" : "Open MianLeMe to add one")
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
            } else {
                Text("\(dateText) · \(stageText)")
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
                Text(entry.snapshot.meetingId.isEmpty ? entry.snapshot.role : "\(isChinese ? "会议号" : "ID") \(entry.snapshot.meetingId)")
                    .font(.caption2)
                    .lineLimit(1)
            }
        }
    }
}

@main
struct MianlemeWidget: Widget {
    let kind = "MianlemeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            MianlemeWidgetView(entry: entry)
        }
        .configurationDisplayName("面了么")
        .description("显示下一场面试和倒计时信息。")
        .supportedFamilies(mianlemeSupportedFamilies)
    }
}

private var mianlemeSupportedFamilies: [WidgetFamily] {
    var families: [WidgetFamily] = [.systemSmall, .systemMedium]
    if #available(iOSApplicationExtension 16.0, *) {
        families.append(contentsOf: [.accessoryInline, .accessoryCircular, .accessoryRectangular])
    }
    return families
}

private struct WidgetBackgroundView: View {
    var body: some View {
        ZStack(alignment: .leading) {
            LinearGradient(
                colors: [
                    Color(red: 0.97, green: 0.99, blue: 1.0),
                    Color(red: 0.91, green: 0.97, blue: 0.94),
                    Color(red: 1.0, green: 0.95, blue: 0.86)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Rectangle()
                .fill(
                    LinearGradient(
                        colors: [Color(red: 0.02, green: 0.39, blue: 0.78), Color(red: 0.0, green: 0.58, blue: 0.45)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: 5)
        }
    }
}

private extension View {
    @ViewBuilder
    func mianlemeWidgetBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget) {
                WidgetBackgroundView()
            }
        } else {
            background(WidgetBackgroundView())
        }
    }
}

private extension Date {
    var iso8601String: String {
        ISO8601DateFormatter().string(from: self)
    }
}
