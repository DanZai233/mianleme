import UIKit
import UserNotifications
import UserNotificationsUI

final class NotificationViewController: UIViewController, UNNotificationContentExtension {
    private let titleLabel = UILabel()
    private let roleLabel = UILabel()
    private let timeLabel = UILabel()
    private let stageLabel = UILabel()
    private let meetingLabel = UILabel()
    private let platformLabel = UILabel()
    private let linkLabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        preferredContentSize = CGSize(width: 0, height: 220)
        configureView()
    }

    func didReceive(_ notification: UNNotification) {
        let userInfo = notification.request.content.userInfo
        let lang = textValue(userInfo["lang"]) == "en" ? "en" : "zh"
        let company = textValue(userInfo["company"])
        let role = textValue(userInfo["role"])
        let stage = stageText(textValue(userInfo["stage"]), lang: lang)
        let meetingId = textValue(userInfo["meetingId"])
        let platform = textValue(userInfo["platform"])
        let link = textValue(userInfo["link"])
        let interviewDate = formattedDate(textValue(userInfo["interviewDate"]), lang: lang)

        titleLabel.text = company.isEmpty ? notification.request.content.title : company
        roleLabel.text = role.isEmpty ? notification.request.content.body : role
        timeLabel.text = interviewDate.isEmpty ? (lang == "zh" ? "时间待确认" : "Time TBD") : interviewDate
        stageLabel.text = stage
        meetingLabel.text = meetingId.isEmpty ? (lang == "zh" ? "会议号待确认" : "Meeting ID TBD") : "\(lang == "zh" ? "会议号" : "ID") \(meetingId)"
        platformLabel.text = platform.isEmpty ? (lang == "zh" ? "平台待确认" : "Platform TBD") : platform
        linkLabel.text = link.isEmpty ? (lang == "zh" ? "链接待确认" : "Link TBD") : link
    }

    private func configureView() {
        view.backgroundColor = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.07, green: 0.08, blue: 0.10, alpha: 1)
                : UIColor(red: 0.96, green: 0.97, blue: 0.98, alpha: 1)
        }

        let content = UIStackView()
        content.axis = .vertical
        content.spacing = 12
        content.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(content)

        NSLayoutConstraint.activate([
            content.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 18),
            content.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -18),
            content.topAnchor.constraint(equalTo: view.topAnchor, constant: 16),
            content.bottomAnchor.constraint(lessThanOrEqualTo: view.bottomAnchor, constant: -16)
        ])

        let header = UIStackView()
        header.axis = .vertical
        header.spacing = 4
        content.addArrangedSubview(header)

        configure(titleLabel, size: 22, weight: .bold, color: .label, lines: 1)
        configure(roleLabel, size: 14, weight: .semibold, color: .secondaryLabel, lines: 1)
        header.addArrangedSubview(titleLabel)
        header.addArrangedSubview(roleLabel)

        let timeRow = UIStackView()
        timeRow.axis = .horizontal
        timeRow.alignment = .center
        timeRow.spacing = 8
        content.addArrangedSubview(timeRow)

        let clock = UIImageView(image: UIImage(systemName: "clock.fill"))
        clock.tintColor = UIColor(red: 0.10, green: 0.34, blue: 0.78, alpha: 1)
        clock.contentMode = .scaleAspectFit
        clock.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            clock.widthAnchor.constraint(equalToConstant: 18),
            clock.heightAnchor.constraint(equalToConstant: 18)
        ])
        configure(timeLabel, size: 18, weight: .bold, color: .label, lines: 1)
        timeRow.addArrangedSubview(clock)
        timeRow.addArrangedSubview(timeLabel)

        let chips = UIStackView()
        chips.axis = .horizontal
        chips.spacing = 8
        chips.distribution = .fillProportionally
        content.addArrangedSubview(chips)

        configure(stageLabel, size: 12, weight: .bold, color: .label, lines: 1)
        configure(meetingLabel, size: 12, weight: .semibold, color: .label, lines: 1)
        chips.addArrangedSubview(chip(stageLabel))
        chips.addArrangedSubview(chip(meetingLabel))

        let details = UIStackView()
        details.axis = .vertical
        details.spacing = 4
        content.addArrangedSubview(details)

        configure(platformLabel, size: 12, weight: .medium, color: .secondaryLabel, lines: 1)
        configure(linkLabel, size: 12, weight: .medium, color: .secondaryLabel, lines: 1)
        details.addArrangedSubview(platformLabel)
        details.addArrangedSubview(linkLabel)
    }

    private func configure(_ label: UILabel, size: CGFloat, weight: UIFont.Weight, color: UIColor, lines: Int) {
        label.font = UIFont.systemFont(ofSize: size, weight: weight)
        label.textColor = color
        label.numberOfLines = lines
        label.adjustsFontSizeToFitWidth = true
        label.minimumScaleFactor = 0.75
        label.lineBreakMode = .byTruncatingTail
    }

    private func chip(_ label: UILabel) -> UIView {
        let container = UIView()
        container.backgroundColor = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor.white.withAlphaComponent(0.10)
                : UIColor.white.withAlphaComponent(0.72)
        }
        container.layer.cornerRadius = 12
        container.layer.cornerCurve = .continuous
        container.layer.borderWidth = 1
        container.layer.borderColor = UIColor.separator.withAlphaComponent(0.45).cgColor

        label.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 10),
            label.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -10),
            label.topAnchor.constraint(equalTo: container.topAnchor, constant: 6),
            label.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -6)
        ])
        return container
    }

    private func textValue(_ value: Any?) -> String {
        (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private func formattedDate(_ value: String, lang: String) -> String {
        guard let date = parseISODate(value) else { return "" }
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

    private func stageText(_ value: String, lang: String) -> String {
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
