import Foundation

extension TONIosBackgroundDownloadsManager {
  func makeSession() -> URLSession {
    let configuration = URLSessionConfiguration.background(withIdentifier: Self.backgroundIdentifier)
    configuration.isDiscretionary = false
    configuration.sessionSendsLaunchEvents = true
    configuration.waitsForConnectivity = true
    configuration.allowsCellularAccess = true
    return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
  }

  func makeRecoverySession() -> URLSession {
    let configuration = URLSessionConfiguration.default
    configuration.waitsForConnectivity = true
    configuration.allowsCellularAccess = true
    return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
  }

  func loadState() {
    guard FileManager.default.fileExists(atPath: stateFileURL.path) else { return }
    do {
      let records = try decoder.decode(
        [TONIosBackgroundDownloadRecord].self,
        from: Data(contentsOf: stateFileURL)
      )
      recordsByItemId = Dictionary(uniqueKeysWithValues: records.map { ($0.itemId, $0) })
    } catch {
      recordsByItemId = [:]
    }
  }

  func persistState() {
    do {
      try FileManager.default.createDirectory(
        at: stateFileURL.deletingLastPathComponent(),
        withIntermediateDirectories: true,
      )
      let payload = recordsByItemId.values.sorted { $0.itemId < $1.itemId }
      try encoder.encode(payload).write(to: stateFileURL, options: .atomic)
    } catch {
      NSLog("[TON][iOSDownloads] Failed to persist state: %@", error.localizedDescription)
    }
  }

  func networkHeaders(from headers: [String: String]) -> [String: String] {
    headers.filter { !$0.key.lowercased().hasPrefix("x-ton-") }
  }

  func emit(_ record: TONIosBackgroundDownloadRecord) {
    TONIosDownloadActivityManager.shared.synchronize(record)
    let payload = record.asDictionary()
    DispatchQueue.main.async { self.eventSink?(payload) }
  }

  func reconcileSessionTasks(completion: @escaping () -> Void) {
    session.getAllTasks { backgroundTasks in
      self.recoverySession.getAllTasks { recoveryTasks in
        self.stateQueue.async {
          var matchedItemIds = Set<Int>()
          var didChange = false
          for task in backgroundTasks + recoveryTasks {
            guard let itemId = self.resolveItemId(for: task, matchedItemIds: matchedItemIds),
                  var record = self.recordsByItemId[itemId] else { continue }
            matchedItemIds.insert(itemId)
            let taskDescription = String(itemId)
            if task.taskDescription != taskDescription { task.taskDescription = taskDescription }
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
              let progress = min(max(Double(receivedBytes) / Double(normalizedTotalBytes), 0), 0.999)
              if abs(record.progress - progress) > 0.0001 {
                record.progress = progress
                didChange = true
              }
            }
            self.recordsByItemId[itemId] = record
          }

          for (itemId, record) in Array(self.recordsByItemId)
            where record.state == "running" && !matchedItemIds.contains(itemId) {
            var failedRecord = record
            failedRecord.state = "failed"
            failedRecord.error = "Download session lost"
            self.recordsByItemId[itemId] = failedRecord
            self.emit(failedRecord)
            didChange = true
          }
          if didChange { self.persistState() }
          completion()
        }
      }
    }
  }

  func resolveItemId(for task: URLSessionTask, matchedItemIds: Set<Int>) -> Int? {
    if let description = task.taskDescription,
       let parsed = Int(description), recordsByItemId[parsed] != nil { return parsed }
    let requestURL = task.originalRequest?.url?.absoluteString
      ?? task.currentRequest?.url?.absoluteString
    guard let requestURL else { return nil }
    return recordsByItemId.values.first {
      $0.state == "running" && !matchedItemIds.contains($0.itemId) && $0.url == requestURL
    }?.itemId
  }

  func withTask(taskId: Int, action: @escaping (URLSessionTask) -> Void) {
    session.getAllTasks { tasks in
      if let task = tasks.first(where: { $0.taskIdentifier == taskId }) {
        action(task)
        return
      }
      self.recoverySession.getAllTasks { recoveryTasks in
        if let task = recoveryTasks.first(where: { $0.taskIdentifier == taskId }) { action(task) }
      }
    }
  }

  func parseItemId(task: URLSessionTask) -> Int? {
    if let description = task.taskDescription, let parsed = Int(description) { return parsed }
    return recordsByItemId.values.first { $0.taskId == task.taskIdentifier }?.itemId
  }

  func destinationURL(from path: String) -> URL {
    if path.hasPrefix("file://"), let url = URL(string: path) { return url }
    return URL(fileURLWithPath: path)
  }

  func resolveFileSize(from attributes: [FileAttributeKey: Any], fallback: Int64) -> Int64 {
    if let size = (attributes[.size] as? NSNumber)?.int64Value { return size }
    if let size = attributes[.size] as? Int { return Int64(size) }
    if let size = attributes[.size] as? Int64 { return size }
    return fallback
  }

  func validateDownloadContentType(
    response: HTTPURLResponse,
    record: TONIosBackgroundDownloadRecord,
  ) throws {
    guard let mimeType = response.mimeType?.lowercased(), !mimeType.isEmpty else { return }
    if mimeType.hasPrefix("audio/") || mimeType == "application/octet-stream" { return }
    if record.format == "m4a" && mimeType == "video/mp4" { return }
    throw NSError(
      domain: "TONIosBackgroundDownloads",
      code: 6,
      userInfo: [NSLocalizedDescriptionKey: "Download failed: unexpected content type \(mimeType)"],
    )
  }

  func validateDownloadResponse(task: URLSessionTask, record: TONIosBackgroundDownloadRecord) throws {
    guard let response = task.response as? HTTPURLResponse else { return }
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

  func completeRecovery(
    itemId: Int,
    result: Result<TONIosBackgroundDownloadRecord, Error>,
  ) {
    recoveryTasksByItemId.removeValue(forKey: itemId)
    recoveryCompletions.removeValue(forKey: itemId)?(result)
  }
}
