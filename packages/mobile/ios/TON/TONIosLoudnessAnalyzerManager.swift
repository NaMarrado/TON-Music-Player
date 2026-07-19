import Foundation

@objc(TONIosLoudnessAnalyzerManager)
final class TONIosLoudnessAnalyzerManager: NSObject {
  @objc
  static func sharedManager() -> TONIosLoudnessAnalyzerManager { shared }

  private static let shared = TONIosLoudnessAnalyzerManager()
  private let stateQueue = DispatchQueue(label: "cz.ton.player.ios-loudness-analyzer")
  private var eventSink: (([String: Any]) -> Void)?
  private var tasks: [String: TONIosLoudnessAnalyzerTask] = [:]

  private override init() { super.init() }

  func setEventSink(_ sink: (([String: Any]) -> Void)?) {
    stateQueue.async { self.eventSink = sink }
  }

  func startAnalysis(
    filePath: String,
    targetLufs: Double,
    completion: @escaping (String?, Error?) -> Void,
  ) {
    stateQueue.async {
      let taskId = UUID().uuidString
      let task = TONIosLoudnessAnalyzerTask(
        taskId: taskId,
        filePath: filePath,
        targetLufs: targetLufs,
      )
      self.tasks[taskId] = task
      completion(taskId, nil)
      DispatchQueue.global(qos: .utility).async {
        self.finishTask(taskId: taskId, outcome: task.run())
      }
    }
  }

  func cancelAnalysis(taskId: String, completion: @escaping () -> Void) {
    stateQueue.async {
      self.tasks[taskId]?.cancel()
      completion()
    }
  }

  private func finishTask(taskId: String, outcome: TONIosLoudnessAnalyzerTask.Outcome) {
    stateQueue.async {
      self.tasks.removeValue(forKey: taskId)
      switch outcome {
      case .cancelled:
        self.emit(["state": "cancelled", "taskId": taskId])
      case let .completed(lufs, gain):
        self.emit(["gain": gain, "lufs": lufs, "state": "completed", "taskId": taskId])
      case let .failed(message):
        self.emit(["error": message, "state": "failed", "taskId": taskId])
      }
    }
  }

  private func emit(_ payload: [String: Any]) {
    DispatchQueue.main.async { self.eventSink?(payload) }
  }
}
