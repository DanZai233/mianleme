import ActivityKit
import Foundation

@available(iOS 16.1, *)
@available(iOSApplicationExtension 16.1, *)
struct MianlemeLiveActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var company: String
        var role: String
        var stage: String
        var interviewDate: String
        var meetingId: String
        var platform: String
        var link: String
        var lang: String
    }

    var interviewId: String
}
