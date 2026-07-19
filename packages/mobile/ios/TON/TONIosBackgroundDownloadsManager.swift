import Foundation

@objc(TONIosBackgroundDownloadsManager)
final class TONIosBackgroundDownloadsManager: NSObject, URLSessionDownloadDelegate, URLSessionDelegate {
  static let backgroundIdentifier = "cz.ton.player.downloads.background"

  @objc
  static func sharedManager() -> TONIosBackgroundDownloadsManager { shared }
  @objc
  static func backgroundSessionIdentifier() -> String { backgroundIdentifier }

  private static let shared = TONIosBackgroundDownloadsManager()
  let stateQueue = DispatchQueue(label: "cz.ton.player.ios-background-downloads")
  let decoder = JSONDecoder()
  let encoder = JSONEncoder()
  let stateFileURL: URL
  var backgroundCompletionHandler: (() -> Void)?
  var eventSink: (([String: Any]) -> Void)?
  var recordsByItemId: [Int: TONIosBackgroundDownloadRecord] = [:]
  var recoveryCompletions: [Int: (Result<TONIosBackgroundDownloadRecord, Error>) -> Void] = [:]
  var recoveryTasksByItemId: [Int: URLSessionTask] = [:]
  lazy var session: URLSession = makeSession()
  lazy var recoverySession: URLSession = makeRecoverySession()

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
    stateQueue.async { self.eventSink = sink }
  }

  func initialize(completion: @escaping () -> Void) {
    stateQueue.async {
      _ = self.session
      self.reconcileSessionTasks {
        TONIosDownloadActivityManager.shared.reconcile(
          self.recordsByItemId.values.filter { !$0.silent }
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
      guard let record = self.recordsByItemId[itemId] else { completion(); return }
      self.withTask(taskId: record.taskId) { $0.cancel() }
      self.recoveryTasksByItemId[itemId]?.cancel()
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
        completion(self.recordsByItemId.values
          .sorted { $0.itemId < $1.itemId }
          .map { $0.asDictionary() })
      }
    }
  }
}
