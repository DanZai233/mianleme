import SwiftUI
import WidgetKit

private struct WidgetInterviewItem: Decodable {
    let company: String
    let role: String
    let stage: String
    let date: String
    let timestamp: Double
    let meetingId: String
    let lang: String

    enum CodingKeys: String, CodingKey {
        case company
        case role
        case stage
        case date
        case timestamp
        case meetingId
        case lang
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        company = try container.decodeIfPresent(String.self, forKey: .company) ?? ""
        role = try container.decodeIfPresent(String.self, forKey: .role) ?? ""
        stage = try container.decodeIfPresent(String.self, forKey: .stage) ?? ""
        date = try container.decodeIfPresent(String.self, forKey: .date) ?? ""
        timestamp = try container.decodeIfPresent(Double.self, forKey: .timestamp) ?? 0
        meetingId = try container.decodeIfPresent(String.self, forKey: .meetingId) ?? ""
        lang = try container.decodeIfPresent(String.self, forKey: .lang) ?? ""
    }

    var startDate: Date? {
        dateFromSnapshotValues(date: date, timestamp: timestamp)
    }
}

private struct InterviewSnapshot: Decodable {
    let hasInterview: Bool
    let company: String
    let role: String
    let stage: String
    let date: String
    let timestamp: Double
    let meetingId: String
    let lang: String
    let items: [WidgetInterviewItem]

    enum CodingKeys: String, CodingKey {
        case hasInterview
        case company
        case role
        case stage
        case date
        case timestamp
        case meetingId
        case lang
        case items
    }

    init(
        hasInterview: Bool,
        company: String,
        role: String,
        stage: String,
        date: String,
        timestamp: Double,
        meetingId: String,
        lang: String,
        items: [WidgetInterviewItem] = []
    ) {
        self.hasInterview = hasInterview
        self.company = company
        self.role = role
        self.stage = stage
        self.date = date
        self.timestamp = timestamp
        self.meetingId = meetingId
        self.lang = lang
        self.items = items
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        company = try container.decodeIfPresent(String.self, forKey: .company) ?? ""
        role = try container.decodeIfPresent(String.self, forKey: .role) ?? ""
        stage = try container.decodeIfPresent(String.self, forKey: .stage) ?? ""
        date = try container.decodeIfPresent(String.self, forKey: .date) ?? ""
        timestamp = try container.decodeIfPresent(Double.self, forKey: .timestamp) ?? 0
        meetingId = try container.decodeIfPresent(String.self, forKey: .meetingId) ?? ""
        lang = try container.decodeIfPresent(String.self, forKey: .lang) ?? "zh"
        items = try container.decodeIfPresent([WidgetInterviewItem].self, forKey: .items) ?? []
        hasInterview = try container.decodeIfPresent(Bool.self, forKey: .hasInterview) ?? (!company.isEmpty || !date.isEmpty)
    }

    var startDate: Date? {
        dateFromSnapshotValues(date: date, timestamp: timestamp)
    }

    func effectiveSnapshot(at referenceDate: Date) -> InterviewSnapshot {
        guard !items.isEmpty else { return self }

        let nextItem = items
            .compactMap { item -> (WidgetInterviewItem, Date)? in
                guard let startDate = item.startDate else { return nil }
                return (item, startDate)
            }
            .filter { _, startDate in startDate > referenceDate.addingTimeInterval(-60) }
            .sorted { $0.1 < $1.1 }
            .first

        guard let nextItem else {
            return InterviewSnapshot(
                hasInterview: false,
                company: "",
                role: lang == "zh" ? "暂无待进行面试" : "No upcoming interviews",
                stage: "",
                date: "",
                timestamp: 0,
                meetingId: "",
                lang: lang,
                items: items
            )
        }

        let item = nextItem.0
        return InterviewSnapshot(
            hasInterview: true,
            company: item.company,
            role: item.role,
            stage: item.stage,
            date: item.date,
            timestamp: item.timestamp,
            meetingId: item.meetingId,
            lang: item.lang.isEmpty ? lang : item.lang,
            items: items
        )
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
                timestamp: Date().addingTimeInterval(3600).timeIntervalSince1970 * 1000,
                meetingId: "123 456 789",
                lang: "zh"
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (InterviewEntry) -> Void) {
        let now = Date()
        completion(InterviewEntry(date: now, snapshot: loadSnapshot().effectiveSnapshot(at: now)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<InterviewEntry>) -> Void) {
        let now = Date()
        let storedSnapshot = loadSnapshot()
        let entryDates = timelineEntryDates(for: storedSnapshot, from: now)
        let entries = entryDates.map { date in
            InterviewEntry(date: date, snapshot: storedSnapshot.effectiveSnapshot(at: date))
        }
        let nextRefresh = (entryDates.last ?? now).addingTimeInterval(60)
        completion(Timeline(entries: entries, policy: .after(nextRefresh)))
    }

    private func loadSnapshot() -> InterviewSnapshot {
        let defaults = UserDefaults(suiteName: appGroupIdentifier) ?? .standard
        if let data = defaults.data(forKey: snapshotKey),
           let snapshot = try? JSONDecoder().decode(InterviewSnapshot.self, from: data) {
            return snapshot
        }
        return InterviewSnapshot(hasInterview: false, company: "", role: "暂无待进行面试", stage: "", date: "", timestamp: 0, meetingId: "", lang: "zh")
    }

    private func timelineEntryDates(for storedSnapshot: InterviewSnapshot, from now: Date) -> [Date] {
        let currentSnapshot = storedSnapshot.effectiveSnapshot(at: now)
        guard currentSnapshot.hasInterview, let startDate = currentSnapshot.startDate, startDate > now else {
            return [now]
        }

        var dates = [now]
        var cursor = nextTimelineDate(after: now, startDate: startDate)
        let horizon = min(startDate.addingTimeInterval(90), now.addingTimeInterval(6 * 60 * 60))

        while cursor <= horizon && dates.count < 48 {
            dates.append(cursor)
            cursor = nextTimelineDate(after: cursor, startDate: startDate)
        }

        return dates
    }

    private func nextTimelineDate(after date: Date, startDate: Date) -> Date {
        let remaining = startDate.timeIntervalSince(date)
        let step: TimeInterval
        if remaining <= 60 * 60 {
            step = 60
        } else if remaining <= 6 * 60 * 60 {
            step = 5 * 60
        } else if remaining <= 24 * 60 * 60 {
            step = 15 * 60
        } else {
            step = 60 * 60
        }
        return date.addingTimeInterval(step)
    }
}

private struct MianlemeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var colorScheme
    let entry: Provider.Entry

    private var isEmpty: Bool {
        !entry.snapshot.hasInterview
    }

    private var startDate: Date? {
        entry.snapshot.startDate
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
        let seconds = Int(date.timeIntervalSince(entry.date))
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

    private var isDarkMode: Bool {
        colorScheme == .dark
    }

    private var primaryTextColor: Color {
        isDarkMode ? Color(red: 0.94, green: 0.95, blue: 0.97) : Color(red: 0.08, green: 0.09, blue: 0.11)
    }

    private var secondaryTextColor: Color {
        isDarkMode ? Color(red: 0.68, green: 0.71, blue: 0.76) : Color(red: 0.38, green: 0.42, blue: 0.48)
    }

    private var accentColor: Color {
        isDarkMode ? Color(red: 0.54, green: 0.73, blue: 1.0) : Color(red: 0.12, green: 0.37, blue: 0.76)
    }

    private var chipFillColor: Color {
        isDarkMode ? Color.white.opacity(0.08) : Color.white.opacity(0.58)
    }

    private var chipStrokeColor: Color {
        isDarkMode ? Color.white.opacity(0.10) : Color.white.opacity(0.70)
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
        VStack(alignment: .leading, spacing: family == .systemMedium ? 14 : 10) {
            widgetHeader

            if isEmpty {
                emptyHomeContent
            } else if family == .systemMedium {
                mediumHomeContent
            } else {
                smallHomeContent
            }
        }
        .padding(family == .systemMedium ? 17 : 15)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .mianlemeWidgetBackground()
    }

    private var widgetHeader: some View {
        HStack(spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(accentColor.opacity(isDarkMode ? 0.20 : 0.12))
                Image(systemName: "calendar")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(accentColor)
            }
            .frame(width: 22, height: 22)

            Text("面了么")
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundStyle(secondaryTextColor)
                .lineLimit(1)

            Spacer(minLength: 4)

            if !isEmpty {
                countdownGlassTag(prominent: true)
            }
        }
    }

    private var smallHomeContent: some View {
        VStack(alignment: .leading, spacing: 7) {
            Spacer(minLength: 0)
            Text(entry.snapshot.company)
                .font(.system(size: 20, weight: .semibold, design: .rounded))
                .foregroundStyle(primaryTextColor)
                .lineLimit(2)
                .minimumScaleFactor(0.76)
            Text(entry.snapshot.role)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(secondaryTextColor)
                .lineLimit(2)
            Spacer(minLength: 2)
            glassTag(dateText, systemImage: "clock")
        }
    }

    private var mediumHomeContent: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(alignment: .bottom, spacing: 16) {
                VStack(alignment: .leading, spacing: 7) {
                    Text(entry.snapshot.company)
                        .font(.system(size: 22, weight: .semibold, design: .rounded))
                        .foregroundStyle(primaryTextColor)
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)
                    Text(entry.snapshot.role)
                        .font(.system(size: 14, weight: .medium, design: .rounded))
                        .foregroundStyle(secondaryTextColor)
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 3) {
                    countdownValueText
                        .font(.system(size: 18, weight: .semibold, design: .rounded))
                        .foregroundStyle(accentColor)
                        .lineLimit(1)
                        .minimumScaleFactor(0.74)
                    Text(dateText)
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundStyle(secondaryTextColor)
                        .lineLimit(1)
                }
            }

            Rectangle()
                .fill(chipStrokeColor)
                .frame(height: 1)

            HStack(spacing: 7) {
                glassTag(stageText)
                if !entry.snapshot.meetingId.isEmpty {
                    glassTag("\(isChinese ? "会议号" : "ID") \(entry.snapshot.meetingId)", systemImage: "number")
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var countdownValueText: Text {
        guard let date = startDate else {
            return Text(isChinese ? "待确认" : "Pending")
        }
        let seconds = Int(date.timeIntervalSince(entry.date))
        if seconds < -60 {
            return Text(isChinese ? "待更新" : "Update")
        }
        if seconds < 60 {
            return Text(isChinese ? "马上开始" : "Soon")
        }
        return Text(date, style: .timer)
    }

    private func countdownGlassTag(prominent: Bool = false) -> some View {
        HStack(spacing: 4) {
            countdownValueText
                .font(.system(size: prominent ? 11 : 12, weight: .semibold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
        }
        .foregroundStyle(prominent ? accentColor : secondaryTextColor)
        .padding(.horizontal, prominent ? 8 : 9)
        .padding(.vertical, prominent ? 4 : 5)
        .background(chipFillColor, in: Capsule())
        .overlay(Capsule().strokeBorder(chipStrokeColor, lineWidth: 0.8))
    }

    private var emptyHomeContent: some View {
        VStack(alignment: .leading, spacing: 8) {
            Spacer(minLength: 0)
            Image(systemName: "calendar.badge.plus")
                .font(.system(size: family == .systemMedium ? 24 : 20, weight: .semibold))
                .foregroundStyle(accentColor)
                .symbolRenderingMode(.hierarchical)
            Text(isChinese ? "暂无待进行面试" : "No upcoming interviews")
                .font(.system(size: family == .systemMedium ? 20 : 17, weight: .semibold, design: .rounded))
                .foregroundStyle(primaryTextColor)
                .lineLimit(2)
            Text(isChinese ? "添加后自动同步到小组件" : "Add one in the app")
                .font(.system(size: 12, weight: .medium, design: .rounded))
                .foregroundStyle(secondaryTextColor)
                .lineLimit(2)
        }
    }

    private func glassTag(_ text: String, systemImage: String? = nil, prominent: Bool = false) -> some View {
        HStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 10, weight: .semibold))
            }
            Text(text)
                .font(.system(size: prominent ? 11 : 12, weight: .semibold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
        }
        .foregroundStyle(prominent ? accentColor : secondaryTextColor)
        .padding(.horizontal, prominent ? 8 : 9)
        .padding(.vertical, prominent ? 4 : 5)
        .background(chipFillColor, in: Capsule())
        .overlay(Capsule().strokeBorder(chipStrokeColor, lineWidth: 0.8))
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

@main
struct MianlemeWidgetBundle: WidgetBundle {
    var body: some Widget {
        MianlemeWidget()
        if #available(iOSApplicationExtension 16.1, *) {
            MianlemeLiveActivity()
        }
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
    @Environment(\.colorScheme) private var colorScheme

    private var isDarkMode: Bool {
        colorScheme == .dark
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: isDarkMode ? [
                    Color(red: 0.08, green: 0.09, blue: 0.11),
                    Color(red: 0.13, green: 0.14, blue: 0.17),
                    Color(red: 0.09, green: 0.10, blue: 0.13)
                ] : [
                    Color(red: 0.985, green: 0.988, blue: 0.992),
                    Color(red: 0.945, green: 0.958, blue: 0.975),
                    Color(red: 0.965, green: 0.975, blue: 0.970)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Rectangle()
                .fill(.ultraThinMaterial)
                .opacity(isDarkMode ? 0.16 : 0.36)

            LinearGradient(
                colors: [
                    Color.white.opacity(isDarkMode ? 0.10 : 0.62),
                    Color.white.opacity(0.02)
                ],
                startPoint: .top,
                endPoint: .bottom
            )

            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(Color.white.opacity(isDarkMode ? 0.09 : 0.58), lineWidth: 1)
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

private func dateFromSnapshotValues(date: String, timestamp: Double) -> Date? {
    if timestamp > 0 {
        let seconds = timestamp > 10_000_000_000 ? timestamp / 1000 : timestamp
        return Date(timeIntervalSince1970: seconds)
    }
    return parseISODate(date)
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
