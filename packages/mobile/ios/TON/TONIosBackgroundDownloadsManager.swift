import Foundation

@objc(TONIosBackgroundDownloadsManager)
final class TONIosBackgroundDownloadsManager: NSObject, URLSessionDownloadDelegate, URLSessionDelegate {
  private static let backgroundIdentifier = "com.ton.player.downloads.background"

  @objc
  static func sharedManager() -> TONIosBackgroundDownloadsManager {
    shared
  }

  @objc
  static func backgroundSessionIdentifier() -> String {
    backgroundIdentifier
  }

  private static let shared = TONIosBackgroundDownloadsManager()

  private let stateQueue = DispatchQueue(label: "com.ton.player.ios-background-downloads")
  private let decoder = JSONDecoder()
  private let encoder = JSONEncoder()
  private let stateFileURL: URL

  private var backgroundCompletionHandler: (() -> Void)?
  private var eventSink: (([String: Any]) -> Void)?
  private var recordsByItemId: [Int: TONIosBackgroundDownloadRecord] = [:]
  private var recoveryCompletions: [Int: (Result<TONIosBackgroundDownloadRecord, Error>) -> Void] = [:]
  private var recoveryTasksByItemId: [Int: URLSessionTask] = [:]
  private lazy var session: URLSession = makeSession()
  private lazy var recoverySession: URLSession = makeRecoverySession()

  private override init() {
    let fileManager = FileManager.default
    let appSupportURL = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("TON", isDirectory: true)
    stateFileURL = appSupportURL.appendingPathComponent("ios-background-downloads.json")
    super.init()
    loadState()
    _ = session
  }

  @objc(setBackgroundSessionCompletionHandler:)
  func setBackgroundSessionCompletionHandler(_ handler: @escaping () -> Void) {
    stateQueue.async {
      self.backgroundCompletionHandler = handler
      _ = self.session
    }
  }

  func setEventSink(_ sink: (([String: Any]) -> Void)?) {
    stateQueue.async {
      self.eventSink = sink
    }
  }

  func initialize(completion: @escaping () -> Void) {
    stateQueue.async {
      _ = self.session
      self.reconcileSessionTasks {
        TONIosDownloadActivityManager.shared.reconcile(
          Array(self.recordsByItemId.values)
        )
        completion()
      }
    }
  }

  func startDownload(
    request: TONIosBackgroundDownloadRequest,
    completion: @escaping (Error?) -> Void,
  ) {
    stateQueue.async {
      if let existing = self.recordsByItemId[request.itemId], existing.state == "running" {
        completion(NSError(
          domain: "TONIosBackgroundDownloads",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Download is already running."],
        ))
        return
      }

      guard let url = URL(string: request.url) else {
        completion(NSError(
          domain: "TONIosBackgroundDownloads",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Invalid download URL."],
        ))
        return
      }

      var urlRequest = URLRequest(url: url)
      for (header, value) in self.networkHeaders(from: request.headers) {
        urlRequest.setValue(value, forHTTPHeaderField: header)
      }

      let task = self.session.downloadTask(with: urlRequest)
      task.taskDescription = String(request.itemId)

      let record = TONIosBackgroundDownloadRecord(request: request, taskId: task.taskIdentifier)
      self.recordsByItemId[request.itemId] = record
      self.persistState()
      task.resume()
      self.emit(record)
      completion(nil)
    }
  }

  func recoverDownload(
    request: TONIosBackgroundDownloadRequest,
    completion: @escaping (Result<TONIosBackgroundDownloadRecord, Error>) -> Void,
  ) {
    stateQueue.async {
      if self.recoveryCompletions[request.itemId] != nil {
        completion(.failure(NSError(
          domain: "TONIosBackgroundDownloads",
          code: 3,
          userInfo: [NSLocalizedDescriptionKey: "Download recovery is already running."],
        )))
        return
      }

      guard let url = URL(string: request.url) else {
        completion(.failure(NSError(
          domain: "TONIosBackgroundDownloads",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Invalid download URL."],
        )))
        return
      }

      var urlRequest = URLRequest(url: url)
      for (header, value) in self.networkHeaders(from: request.headers) {
        urlRequest.setValue(value, forHTTPHeaderField: header)
      }

      let task = self.recoverySession.downloadTask(with: urlRequest)
      task.taskDescription = String(request.itemId)

      var record = TONIosBackgroundDownloadRecord(request: request, taskId: task.taskIdentifier)
      record.state = "running"
      record.bytesWritten = 0
      record.totalBytes = nil
      record.progress = 0
      record.error = nil

      self.recoveryCompletions[request.itemId] = completion
      self.recoveryTasksByItemId[request.itemId] = task
      self.recordsByItemId[request.itemId] = record
      self.persistState()
      task.resume()
      self.emit(record)
    }
  }

  func cancelDownload(itemId: Int, completion: @escaping () -> Void) {
    stateQueue.async {
      guard let record = self.recordsByItemId[itemId] else {
        completion()
        return
      }

      self.withTask(taskId: record.taskId) { task in
        task.cancel()
      }
      if let recoveryTask = self.recoveryTasksByItemId[itemId] {
        recoveryTask.cancel()
      }

      var nextRecord = record
      nextRecord.state = "cancelled"
      nextRecord.error = nil
      self.recordsByItemId[itemId] = nextRecord
      self.persistState()
      self.emit(nextRecord)

      if self.recoveryCompletions[itemId] != nil {
        self.completeRecovery(
          itemId: itemId,
          result: .failure(NSError(
            domain: NSURLErrorDomain,
            code: NSURLErrorCancelled,
            userInfo: [NSLocalizedDescriptionKey: "Download cancelled."],
          )),
        )
      }

      completion()
    }
  }

  func acknowledgeSettled(itemId: Int, completion: @escaping () -> Void) {
    stateQueue.async {
      self.recordsByItemId.removeValue(forKey: itemId)
      self.persistState()
      completion()
    }
  }

  func getSnapshot(completion: @escaping ([[String: Any]]) -> Void) {
    stateQueue.async {
      self.reconcileSessionTasks {
        completion(
          self.recordsByItemId.values
            .sorted { $0.itemId < $1.itemId }
            .map { $0.asDictionary() },
        )
      }
    }
  }

  private func makeSession() -> URLSession {
    let configuration = URLSessionConfiguration.background(
      withIdentifier: Self.backgroundIdentifier,
    )
    configuration.isDiscretionary = false
    configuration.sessionSendsLaunchEvents = true
    configuration.waitsForConnectivity = true
    configuration.allowsCellularAccess = true
    return URLSession(
      configuration: configuration,
      delegate: self,
      delegateQueue: nil,
    )
  }

  private func makeRecoverySession() -> URLSession {
    let configuration = URLSessionConfiguration.default
    configuration.waitsForConnectivity = true
    configuration.allowsCellularAccess = true
    return URLSession(
      configuration: configuration,
      delegate: self,
      delegateQueue: nil,
    )
  }

  private func loadState() {
    let fileManager = FileManager.default
    if !fileManager.fileExists(atPath: stateFileURL.path) {
      return
    }

    do {
      let data = try Data(contentsOf: stateFileURL)
      let records = try decoder.decode([TONIosBackgroundDownloadRecord].self, from: data)
      recordsByItemId = Dictionary(uniqueKeysWithValues: records.map { ($0.itemId, $0) })
    } catch {
      recordsByItemId = [:]
    }
  }

  private func persistState() {
    let fileManager = FileManager.default

    do {
      try fileManager.createDirectory(
        at: stateFileURL.deletingLastPathComponent(),
        withIntermediateDirectories: true,
      )
      let payload = recordsByItemId.values.sorted { $0.itemId < $1.itemId }
      let data = try encoder.encode(payload)
      try data.write(to: stateFileURL, options: .atomic)
    } catch {
      NSLog("[TON][iOSDownloads] Failed to persist state: %@", error.localizedDescription)
    }
  }

  private func networkHeaders(from headers: [String: String]) -> [String: String] {
    headers.filter { entry in
      !entry.key.lowercased().hasPrefix("x-ton-")
    }
  }

  private func emit(_ record: TONIosBackgroundDownloadRecord) {
    TONIosDownloadActivityManager.shared.synchronize(record)
    let payload = record.asDictionary()
    DispatchQueue.main.async {
      self.eventSink?(payload)
    }
  }

  private func reconcileSessionTasks(completion: @escaping () -> Void) {
    session.getAllTasks { backgroundTasks in
      self.recoverySession.getAllTasks { recoveryTasks in
        self.stateQueue.async {
          var matchedItemIds = Set<Int>()
          var didChange = false

          for task in backgroundTasks + recoveryTasks {
            let resolvedItemId =
              self.resolveItemId(for: task, matchedItemIds: matchedItemIds)

            guard let itemId = resolvedItemId,
                  var record = self.recordsByItemId[itemId] else {
              continue
            }

            matchedItemIds.insert(itemId)

            let taskDescription = String(itemId)
            if task.taskDescription != taskDescription {
              task.taskDescription = taskDescription
            }

            if record.taskId != task.taskIdentifier {
              record.taskId = task.taskIdentifier
              didChange = true
            }

            if record.state != "running" {
              record.state = "running"
              record.error = nil
              didChange = true
            }

            let totalBytes = task.countOfBytesExpectedToReceive
            let receivedBytes = task.countOfBytesReceived
            let normalizedTotalBytes = totalBytes > 0 ? totalBytes : record.totalBytes

            if record.totalBytes != normalizedTotalBytes {
              record.totalBytes = normalizedTotalBytes
              didChange = true
            }

            if receivedBytes > 0 && record.bytesWritten != receivedBytes {
              record.bytesWritten = receivedBytes
              didChange = true
            }

            if let normalizedTotalBytes, normalizedTotalBytes > 0 {
              let nextProgress = min(
                max(Double(receivedBytes) / Double(normalizedTotalBytes), 0),
                0.999,
              )
              if abs(record.progress - nextProgress) > 0.0001 {
                record.progress = nextProgress
                didChange = true
              }
            }

            self.recordsByItemId[itemId] = record
          }

          for (itemId, record) in Array(self.recordsByItemId) {
            guard record.state == "running", !matchedItemIds.contains(itemId) else {
              continue
            }

            var failedRecord = record
            failedRecord.state = "failed"
            failedRecord.error = "Download session lost"
            self.recordsByItemId[itemId] = failedRecord
            self.emit(failedRecord)
            didChange = true
          }

          if didChange {
            self.persistState()
          }

          completion()
        }
      }
    }
  }

  private func resolveItemId(
    for task: URLSessionTask,
    matchedItemIds: Set<Int>,
  ) -> Int? {
    if let description = task.taskDescription,
       let parsed = Int(description),
       recordsByItemId[parsed] != nil {
      return parsed
    }

    let requestURL = task.originalRequest?.url?.absoluteString
      ?? task.currentRequest?.url?.absoluteString
    guard let requestURL else {
      return nil
    }

    return recordsByItemId.values.first(where: {
      $0.state == "running"
        && !matchedItemIds.contains($0.itemId)
        && $0.url == requestURL
    })?.itemId
  }

  private func withTask(taskId: Int, action: @escaping (URLSessionTask) -> Void) {
    session.getAllTasks { tasks in
      if let task = tasks.first(where: { $0.taskIdentifier == taskId }) {
        action(task)
        return
      }

      self.recoverySession.getAllTasks { recoveryTasks in
        if let task = recoveryTasks.first(where: { $0.taskIdentifier == taskId }) {
          action(task)
        }
      }
    }
  }

  private func parseItemId(task: URLSessionTask) -> Int? {
    if let description = task.taskDescription, let parsed = Int(description) {
      return parsed
    }

    return recordsByItemId.values.first(where: { $0.taskId == task.taskIdentifier })?.itemId
  }

  private func destinationURL(from path: String) -> URL {
    if path.hasPrefix("file://"), let url = URL(string: path) {
      return url
    }

    return URL(fileURLWithPath: path)
  }

  private func resolveFileSize(
    from attributes: [FileAttributeKey: Any],
    fallback: Int64,
  ) -> Int64 {
    if let size = (attributes[.size] as? NSNumber)?.int64Value {
      return size
    }

    if let size = attributes[.size] as? Int {
      return Int64(size)
    }

    if let size = attributes[.size] as? Int64 {
      return size
    }

    return fallback
  }

  private func validateDownloadContentType(
    response: HTTPURLResponse,
    record: TONIosBackgroundDownloadRecord,
  ) throws {
    guard let mimeType = response.mimeType?.lowercased(), !mimeType.isEmpty else {
      return
    }

    if mimeType.hasPrefix("audio/") || mimeType == "application/octet-stream" {
      return
    }

    if record.format == "m4a" && mimeType == "video/mp4" {
      return
    }

    throw NSError(
      domain: "TONIosBackgroundDownloads",
      code: 6,
      userInfo: [NSLocalizedDescriptionKey: "Download failed: unexpected content type \(mimeType)"],
    )
  }

  private func validateDownloadResponse(
    task: URLSessionTask,
    record: TONIosBackgroundDownloadRecord,
  ) throws {
    guard let response = task.response as? HTTPURLResponse else {
      return
    }

    if response.statusCode == 200 || response.statusCode == 206 {
      try validateDownloadContentType(response: response, record: record)
      return
    }

    throw NSError(
      domain: "TONIosBackgroundDownloads",
      code: response.statusCode,
      userInfo: [NSLocalizedDescriptionKey: "Download failed: HTTP \(response.statusCode)"],
    )
  }

  private func completeRecovery(
    itemId: Int,
    result: Result<TONIosBackgroundDownloadRecord, Error>,
  ) {
    recoveryTasksByItemId.removeValue(forKey: itemId)
    guard let completion = recoveryCompletions.removeValue(forKey: itemId) else {
      return
    }

    completion(result)
  }

  func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64,
    totalBytesExpectedToWrite: Int64,
  ) {
    stateQueue.async {
      guard let itemId = self.parseItemId(task: downloadTask),
            var record = self.recordsByItemId[itemId] else {
        return
      }

      record.taskId = downloadTask.taskIdentifier
      record.state = "running"
      record.bytesWritten = totalBytesWritten
      record.totalBytes = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : nil
      if totalBytesExpectedToWrite > 0 {
        record.progress = min(
          max(Double(totalBytesWritten) / Double(totalBytesExpectedToWrite), 0),
          0.999,
        )
      }
      self.recordsByItemId[itemId] = record
      self.persistState()
      self.emit(record)
    }
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void,
  ) {
    stateQueue.async {
      var redirectedRequest = request

      if let itemId = self.parseItemId(task: task),
         var record = self.recordsByItemId[itemId] {
        for (header, value) in record.headers {
          redirectedRequest.setValue(value, forHTTPHeaderField: header)
        }

        if let redirectedURL = redirectedRequest.url?.absoluteString {
          record.url = redirectedURL
        }
        record.taskId = task.taskIdentifier
        self.recordsByItemId[itemId] = record
        self.persistState()
      }

      completionHandler(redirectedRequest)
    }
  }

  func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didFinishDownloadingTo location: URL,
  ) {
    stateQueue.sync {
      guard let itemId = self.parseItemId(task: downloadTask),
            var record = self.recordsByItemId[itemId] else {
        return
      }

      let fileManager = FileManager.default
      let destinationURL = self.destinationURL(from: record.destinationPath)
      let isRecoveryTask = self.recoveryCompletions[itemId] != nil

      do {
        try self.validateDownloadResponse(task: downloadTask, record: record)

        try fileManager.createDirectory(
          at: destinationURL.deletingLastPathComponent(),
          withIntermediateDirectories: true,
        )

        if fileManager.fileExists(atPath: destinationURL.path) {
          try fileManager.removeItem(at: destinationURL)
        }

        try fileManager.moveItem(at: location, to: destinationURL)
        let attributes = try fileManager.attributesOfItem(atPath: destinationURL.path)
        let fileSize = self.resolveFileSize(
          from: attributes,
          fallback: record.totalBytes ?? record.bytesWritten,
        )
        if isRecoveryTask && fileSize < 1000 {
          try? fileManager.removeItem(at: destinationURL)
          throw NSError(
            domain: "TONIosBackgroundDownloads",
            code: 4,
            userInfo: [NSLocalizedDescriptionKey: "Download too small (\(fileSize) bytes), likely blocked"],
          )
        }

        record.taskId = downloadTask.taskIdentifier
        record.state = "completed"
        record.bytesWritten = fileSize
        record.totalBytes = fileSize
        record.progress = 1
        record.error = nil
      } catch {
        record.state = "failed"
        record.error = error.localizedDescription
      }

      self.recordsByItemId[itemId] = record
      self.persistState()
      self.emit(record)

      if isRecoveryTask {
        if record.state == "completed" {
          self.completeRecovery(itemId: itemId, result: .success(record))
        } else {
          self.completeRecovery(
            itemId: itemId,
            result: .failure(NSError(
              domain: "TONIosBackgroundDownloads",
              code: 5,
              userInfo: [NSLocalizedDescriptionKey: record.error ?? "Download recovery failed"],
            )),
          )
        }
      }
    }
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?,
  ) {
    guard let error else {
      return
    }

    stateQueue.async {
      guard let itemId = self.parseItemId(task: task),
            var record = self.recordsByItemId[itemId] else {
        return
      }

      let nsError = error as NSError
      let isRecoveryTask = self.recoveryCompletions[itemId] != nil
      record.taskId = task.taskIdentifier
      record.state = nsError.code == NSURLErrorCancelled ? "cancelled" : "failed"
      record.error = nsError.code == NSURLErrorCancelled ? nil : error.localizedDescription
      self.recordsByItemId[itemId] = record
      self.persistState()
      self.emit(record)

      if isRecoveryTask {
        self.completeRecovery(itemId: itemId, result: .failure(error))
      }
    }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    stateQueue.async {
      guard let completionHandler = self.backgroundCompletionHandler else {
        return
      }

      self.backgroundCompletionHandler = nil
      DispatchQueue.main.async {
        completionHandler()
      }
    }
  }
}
