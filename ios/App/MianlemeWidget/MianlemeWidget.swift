import SwiftUI
import WidgetKit

private struct InterviewSnapshot: Decodable {
    let company: String
    let role: String
    let stage: String
    let date: String
    let meetingId: String
    let lang: String
}

private struct InterviewEntry: TimelineEntry {
    let date: Date
    let snapshot: InterviewSnapshot
}

private struct Provider: TimelineProvider {
    private let appGroupIdentifier = "group.com.danzai.mianleme"
    private let snapshotKey = "nextInterviewWidget"

    func placeholder(in context: Context) -> InterviewEntry {
        InterviewEntry(date: Date(), snapshot: InterviewSnapshot(company: "面了么", role: "下一场面试", stage: "technical1", date: Date().addingTimeInterval(3600).iso8601String, meetingId: "", lang: "zh"))
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
        return InterviewSnapshot(company: "面了么", role: "暂无待进行面试", stage: "", date: "", meetingId: "", lang: "zh")
    }
}

private struct MianlemeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Provider.Entry

    private var isEmpty: Bool {
        entry.snapshot.date.isEmpty
    }

    private var dateText: String {
        guard let date = ISO8601DateFormatter().date(from: entry.snapshot.date) else { return "" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: entry.snapshot.lang == "zh" ? "zh_CN" : "en_US")
        formatter.dateFormat = family == .systemSmall ? "MM/dd HH:mm" : "MMM d, HH:mm"
        return formatter.string(from: date)
    }

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(red: 0.1, green: 0.39, blue: 0.95), Color(red: 0.08, green: 0.62, blue: 0.74)], startPoint: .topLeading, endPoint: .bottomTrailing)
            VStack(alignment: .leading, spacing: 8) {
                Text("面了么")
                    .font(.caption.bold())
                    .foregroundStyle(.white.opacity(0.82))
                Spacer(minLength: 4)
                Text(isEmpty ? entry.snapshot.role : entry.snapshot.company)
                    .font(.headline.bold())
                    .lineLimit(2)
                    .foregroundStyle(.white)
                if !isEmpty {
                    Text(entry.snapshot.role)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(2)
                        .foregroundStyle(.white.opacity(0.9))
                    Text(dateText)
                        .font(.caption.bold())
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(.white.opacity(0.18), in: Capsule())
                        .foregroundStyle(.white)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .padding()
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
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private extension Date {
    var iso8601String: String {
        ISO8601DateFormatter().string(from: self)
    }
}
