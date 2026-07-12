import ActivityKit
import Foundation

@available(iOS 16.1, *)
struct TONDownloadActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    let progressPercent: Int
    let status: String
  }

  let artist: String
  let itemId: Int
  let title: String
}
