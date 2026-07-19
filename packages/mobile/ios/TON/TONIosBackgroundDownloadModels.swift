import Foundation

struct TONIosDownloadActivityRequest {
  let activeNotificationBody: String
  let activeNotificationTitle: String
  let artist: String
  let itemId: Int
  let title: String

  init?(dictionary: [String: Any]) {
    guard
      let activeNotificationBody = dictionary["activeNotificationBody"] as? String,
      let activeNotificationTitle = dictionary["activeNotificationTitle"] as? String,
      let artist = dictionary["artist"] as? String,
      let itemId = dictionary["itemId"] as? NSNumber,
      let title = dictionary["title"] as? String
    else {
      return nil
    }

    self.activeNotificationBody = activeNotificationBody
    self.activeNotificationTitle = activeNotificationTitle
    self.artist = artist
    self.itemId = itemId.intValue
    self.title = title
  }
}

struct TONIosBackgroundDownloadRequest {
  let activeNotificationBody: String
  let activeNotificationTitle: String
  let artist: String
  let contentLength: Int64?
  let coverUrl: String?
  let destinationPath: String
  let format: String
  let headers: [String: String]
  let itemId: Int
  let safeName: String
  let silent: Bool
  let strategy: String?
  let title: String
  let url: String
  let videoId: String

  init?(dictionary: [String: Any]) {
    guard
      let artist = dictionary["artist"] as? String,
      let destinationPath = dictionary["destinationPath"] as? String,
      let format = dictionary["format"] as? String,
      let headers = dictionary["headers"] as? [String: String],
      let itemId = dictionary["itemId"] as? NSNumber,
      let safeName = dictionary["safeName"] as? String,
      let title = dictionary["title"] as? String,
      let url = dictionary["url"] as? String,
      let videoId = dictionary["videoId"] as? String
    else {
      return nil
    }

    self.activeNotificationBody = (dictionary["activeNotificationBody"] as? String) ?? artist
    self.activeNotificationTitle = (dictionary["activeNotificationTitle"] as? String) ?? title
    self.artist = artist
    self.contentLength = (dictionary["contentLength"] as? NSNumber)?.int64Value
    self.coverUrl = dictionary["coverUrl"] as? String
    self.destinationPath = destinationPath
    self.format = format
    self.headers = headers
    self.itemId = itemId.intValue
    self.safeName = safeName
    self.silent = (dictionary["silent"] as? Bool) ?? false
    self.strategy = dictionary["strategy"] as? String
    self.title = title
    self.url = url
    self.videoId = videoId
  }
}

struct TONIosBackgroundDownloadRecord: Codable {
  var activeNotificationBody: String
  var activeNotificationTitle: String
  var artist: String
  var bytesWritten: Int64
  var coverUrl: String?
  var destinationPath: String
  var error: String?
  var format: String
  var headers: [String: String]
  var itemId: Int
  var progress: Double
  var safeName: String
  var silent: Bool
  var state: String
  var strategy: String?
  var taskId: Int
  var title: String
  var totalBytes: Int64?
  var url: String
  var videoId: String

  init(request: TONIosBackgroundDownloadRequest, taskId: Int) {
    self.activeNotificationBody = request.activeNotificationBody
    self.activeNotificationTitle = request.activeNotificationTitle
    self.artist = request.artist
    self.bytesWritten = 0
    self.coverUrl = request.coverUrl
    self.destinationPath = request.destinationPath
    self.error = nil
    self.format = request.format
    self.headers = request.headers
    self.itemId = request.itemId
    self.progress = 0
    self.safeName = request.safeName
    self.silent = request.silent
    self.state = "running"
    self.strategy = request.strategy
    self.taskId = taskId
    self.title = request.title
    self.totalBytes = nil
    self.url = request.url
    self.videoId = request.videoId
  }

  enum CodingKeys: String, CodingKey {
    case activeNotificationBody
    case activeNotificationTitle
    case artist
    case bytesWritten
    case coverUrl
    case destinationPath
    case error
    case format
    case headers
    case itemId
    case progress
    case safeName
    case silent
    case state
    case strategy
    case taskId
    case title
    case totalBytes
    case url
    case videoId
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    activeNotificationBody = try container.decodeIfPresent(
      String.self,
      forKey: .activeNotificationBody
    ) ?? ""
    activeNotificationTitle = try container.decodeIfPresent(
      String.self,
      forKey: .activeNotificationTitle
    ) ?? ""
    artist = try container.decode(String.self, forKey: .artist)
    bytesWritten = try container.decode(Int64.self, forKey: .bytesWritten)
    coverUrl = try container.decodeIfPresent(String.self, forKey: .coverUrl)
    destinationPath = try container.decode(String.self, forKey: .destinationPath)
    error = try container.decodeIfPresent(String.self, forKey: .error)
    format = try container.decode(String.self, forKey: .format)
    headers = try container.decodeIfPresent([String: String].self, forKey: .headers) ?? [:]
    itemId = try container.decode(Int.self, forKey: .itemId)
    progress = try container.decode(Double.self, forKey: .progress)
    safeName = try container.decode(String.self, forKey: .safeName)
    silent = try container.decodeIfPresent(Bool.self, forKey: .silent) ?? false
    state = try container.decode(String.self, forKey: .state)
    strategy = try container.decodeIfPresent(String.self, forKey: .strategy)
    taskId = try container.decode(Int.self, forKey: .taskId)
    title = try container.decode(String.self, forKey: .title)
    totalBytes = try container.decodeIfPresent(Int64.self, forKey: .totalBytes)
    url = try container.decode(String.self, forKey: .url)
    videoId = try container.decode(String.self, forKey: .videoId)
    if activeNotificationBody.isEmpty {
      activeNotificationBody = artist
    }
    if activeNotificationTitle.isEmpty {
      activeNotificationTitle = title
    }
  }

  func asDictionary() -> [String: Any] {
    [
      "artist": artist,
      "bytesWritten": bytesWritten,
      "coverUrl": coverUrl as Any,
      "destinationPath": destinationPath,
      "error": error as Any,
      "format": format,
      "headers": headers,
      "itemId": itemId,
      "progress": progress,
      "safeName": safeName,
      "silent": silent,
      "state": state,
      "strategy": strategy as Any,
      "title": title,
      "totalBytes": totalBytes as Any,
      "url": url,
      "videoId": videoId,
    ]
  }
}
