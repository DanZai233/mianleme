import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let appGroupIdentifier = "group.com.danzai.mianleme"
    private let textKey = "pendingSharedText"
    private let imageKey = "pendingSharedImageBase64"

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.systemBackground
        handleSharedItems()
    }

    private func handleSharedItems() {
        let providers = extensionContext?.inputItems
            .compactMap { $0 as? NSExtensionItem }
            .flatMap { $0.attachments ?? [] } ?? []

        let group = DispatchGroup()
        var textParts: [String] = []
        var imageBase64 = ""

        for provider in providers {
            if provider.hasItemConformingToTypeIdentifier(UTType.text.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.text.identifier, options: nil) { item, _ in
                    if let text = item as? String {
                        textParts.append(text)
                    }
                    group.leave()
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
                    if let url = item as? URL {
                        textParts.append(url.absoluteString)
                    } else if let text = item as? String {
                        textParts.append(text)
                    }
                    group.leave()
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier), imageBase64.isEmpty {
                group.enter()
                provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { data, _ in
                    if let data {
                        imageBase64 = "data:image/jpeg;base64,\(data.base64EncodedString())"
                    }
                    group.leave()
                }
            }
        }

        group.notify(queue: .main) {
            self.saveShare(text: textParts.joined(separator: "\n"), imageBase64: imageBase64)
            self.openHostApp()
        }
    }

    private func saveShare(text: String, imageBase64: String) {
        let defaults = UserDefaults(suiteName: appGroupIdentifier) ?? .standard
        if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            defaults.set(text, forKey: textKey)
        }
        if !imageBase64.isEmpty {
            defaults.set(imageBase64, forKey: imageKey)
        }
        defaults.synchronize()
    }

    private func openHostApp() {
        guard let url = URL(string: "mianleme://share") else {
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            return
        }
        extensionContext?.open(url) { _ in
            self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }
}
