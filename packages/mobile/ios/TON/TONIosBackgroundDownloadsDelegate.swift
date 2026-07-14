import Foundation

extension TONIosBackgroundDownloadsManager {
  func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64,
    totalBytesExpectedToWrite: Int64,
  ) {
    stateQueue.async {
      guard let itemId = self.parseItemId(task: downloadTask),
            var record = self.recordsByItemId[itemId] else { return }
      record.taskId = downloadTask.taskIdentifier
      record.state = "running"
      record.bytesWritten = totalBytesWritten
      record.totalBytes = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : nil
      if totalBytesExpectedToWrite > 0 {
        record.progress = min(max(Double(totalBytesWritten) / Double(totalBytesExpectedToWrite), 0), 0.999)
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
      if let itemId = self.parseItemId(task: task), var record = self.recordsByItemId[itemId] {
        for (header, value) in record.headers {
          redirectedRequest.setValue(value, forHTTPHeaderField: header)
        }
        if let redirectedURL = redirectedRequest.url?.absoluteString { record.url = redirectedURL }
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
            var record = self.recordsByItemId[itemId] else { return }
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

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let error else { return }
    stateQueue.async {
      guard let itemId = self.parseItemId(task: task),
            var record = self.recordsByItemId[itemId] else { return }
      let nsError = error as NSError
      let isRecoveryTask = self.recoveryCompletions[itemId] != nil
      record.taskId = task.taskIdentifier
      record.state = nsError.code == NSURLErrorCancelled ? "cancelled" : "failed"
      record.error = nsError.code == NSURLErrorCancelled ? nil : error.localizedDescription
      self.recordsByItemId[itemId] = record
      self.persistState()
      self.emit(record)
      if isRecoveryTask { self.completeRecovery(itemId: itemId, result: .failure(error)) }
    }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    stateQueue.async {
      guard let completionHandler = self.backgroundCompletionHandler else { return }
      self.backgroundCompletionHandler = nil
      DispatchQueue.main.async { completionHandler() }
    }
  }
}
