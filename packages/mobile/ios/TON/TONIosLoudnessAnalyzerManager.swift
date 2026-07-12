import AVFoundation
import Foundation

@objc(TONIosLoudnessAnalyzerManager)
final class TONIosLoudnessAnalyzerManager: NSObject {
  @objc
  static func sharedManager() -> TONIosLoudnessAnalyzerManager {
    shared
  }

  private static let shared = TONIosLoudnessAnalyzerManager()

  private let stateQueue = DispatchQueue(label: "com.ton.player.ios-loudness-analyzer")
  private var eventSink: (([String: Any]) -> Void)?
  private var tasks: [String: TONIosLoudnessAnalyzerTask] = [:]

  private override init() {
    super.init()
  }

  func setEventSink(_ sink: (([String: Any]) -> Void)?) {
    stateQueue.async {
      self.eventSink = sink
    }
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
        let outcome = task.run()
        self.finishTask(taskId: taskId, outcome: outcome)
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
        self.emit([
          "state": "cancelled",
          "taskId": taskId,
        ])
      case let .completed(lufs, gain):
        self.emit([
          "gain": gain,
          "lufs": lufs,
          "state": "completed",
          "taskId": taskId,
        ])
      case let .failed(message):
        self.emit([
          "error": message,
          "state": "failed",
          "taskId": taskId,
        ])
      }
    }
  }

  private func emit(_ payload: [String: Any]) {
    DispatchQueue.main.async {
      self.eventSink?(payload)
    }
  }
}

private final class TONIosLoudnessAnalyzerTask {
  enum Outcome {
    case cancelled
    case completed(lufs: Double, gain: Double)
    case failed(String)
  }

  fileprivate static let absoluteGateLufs = -70.0
  fileprivate static let blockDurationSeconds = 0.4
  fileprivate static let outputSampleRate = 48_000.0
  fileprivate static let stepDurationSeconds = 0.1

  private let filePath: String
  private let stateQueue = DispatchQueue(label: "com.ton.player.ios-loudness-analyzer-task")
  private let targetLufs: Double

  let taskId: String

  private var cancelled = false

  init(taskId: String, filePath: String, targetLufs: Double) {
    self.filePath = filePath
    self.targetLufs = targetLufs
    self.taskId = taskId
  }

  func cancel() {
    stateQueue.sync {
      cancelled = true
    }
  }

  func run() -> Outcome {
    guard let fileURL = resolvedFileURL() else {
      return .failed("Invalid audio file path.")
    }

    if !FileManager.default.fileExists(atPath: fileURL.path) {
      return .failed("Audio file not found.")
    }

    do {
      let inputFile = try AVAudioFile(forReading: fileURL)
      let inputFormat = inputFile.processingFormat
      let channelCount = max(1, Int(inputFormat.channelCount))

      guard let outputFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: Self.outputSampleRate,
        channels: AVAudioChannelCount(channelCount),
        interleaved: false
      ) else {
        return .failed("Failed to create loudness output format.")
      }

      guard let converter = AVAudioConverter(from: inputFormat, to: outputFormat) else {
        return .failed("Failed to create loudness audio converter.")
      }

      guard let inputBuffer = AVAudioPCMBuffer(
        pcmFormat: inputFormat,
        frameCapacity: 16_384
      ), let outputBuffer = AVAudioPCMBuffer(
        pcmFormat: outputFormat,
        frameCapacity: 8_192
      ) else {
        return .failed("Failed to allocate loudness audio buffers.")
      }

      var integrator = LoudnessIntegrator(
        channelCount: channelCount,
        targetLufs: targetLufs,
      )
      var inputError: Error?
      var reachedEndOfStream = false

      while true {
        if isCancelled {
          return .cancelled
        }

        outputBuffer.frameLength = 0
        var conversionError: NSError?
        let status = converter.convert(to: outputBuffer, error: &conversionError) { _, outStatus in
          if self.isCancelled {
            outStatus.pointee = .endOfStream
            return nil
          }

          if reachedEndOfStream {
            outStatus.pointee = .endOfStream
            return nil
          }

          do {
            let remainingFrames = inputFile.length - inputFile.framePosition
            if remainingFrames <= 0 {
              reachedEndOfStream = true
              outStatus.pointee = .endOfStream
              return nil
            }

            inputBuffer.frameLength = 0
            let frameCount = AVAudioFrameCount(
              min(Int64(inputBuffer.frameCapacity), remainingFrames)
            )
            try inputFile.read(into: inputBuffer, frameCount: frameCount)
            if inputBuffer.frameLength == 0 {
              reachedEndOfStream = true
              outStatus.pointee = .endOfStream
              return nil
            }

            outStatus.pointee = .haveData
            return inputBuffer
          } catch {
            inputError = error
            outStatus.pointee = .noDataNow
            return nil
          }
        }

        if isCancelled {
          return .cancelled
        }

        if let inputError {
          return .failed(inputError.localizedDescription)
        }

        if let conversionError {
          return .failed(conversionError.localizedDescription)
        }

        if outputBuffer.frameLength > 0 {
          switch integrator.consume(buffer: outputBuffer, isCancelled: { self.isCancelled }) {
          case .cancelled:
            return .cancelled
          case let .failed(message):
            return .failed(message)
          case .ok:
            break
          }
        }

        switch status {
        case .error:
          return .failed("Audio conversion failed.")
        case .endOfStream:
          return integrator.finish()
        case .haveData, .inputRanDry:
          continue
        @unknown default:
          return .failed("Unknown audio conversion status.")
        }
      }
    } catch {
      return .failed(error.localizedDescription)
    }
  }

  private var isCancelled: Bool {
    stateQueue.sync {
      cancelled
    }
  }

  private func resolvedFileURL() -> URL? {
    if filePath.hasPrefix("file://") {
      return URL(string: filePath)
    }

    return URL(fileURLWithPath: filePath)
  }
}

private struct LoudnessIntegrator {
  enum ConsumeOutcome {
    case ok
    case cancelled
    case failed(String)
  }

  private let blockFrames = Int(TONIosLoudnessAnalyzerTask.blockDurationSeconds * TONIosLoudnessAnalyzerTask.outputSampleRate)
  private let stepFrames = Int(TONIosLoudnessAnalyzerTask.stepDurationSeconds * TONIosLoudnessAnalyzerTask.outputSampleRate)
  private let targetLufs: Double
  private let weights: [Double]

  private var blockEnergies: [Double] = []
  private var frameCursor = 0
  private var ring: [Double]
  private var ringCount = 0
  private var ringIndex = 0
  private var runningEnergySum = 0.0
  private var shelfFilters: [BiquadFilter]
  private var highPassFilters: [BiquadFilter]

  init(channelCount: Int, targetLufs: Double) {
    self.targetLufs = targetLufs
    self.weights = (0..<channelCount).map(Self.channelWeight)
    self.ring = Array(repeating: 0, count: blockFrames)
    self.shelfFilters = Array(
      repeating: BiquadFilter.highShelf48k,
      count: channelCount,
    )
    self.highPassFilters = Array(
      repeating: BiquadFilter.highPass48k,
      count: channelCount,
    )
  }

  mutating func consume(
    buffer: AVAudioPCMBuffer,
    isCancelled: () -> Bool,
  ) -> ConsumeOutcome {
    guard let channels = buffer.floatChannelData else {
      return .failed("Invalid PCM channel data.")
    }

    let frameLength = Int(buffer.frameLength)
    let channelCount = min(Int(buffer.format.channelCount), weights.count)

    for frame in 0..<frameLength {
      if frame % 2048 == 0, isCancelled() {
        return .cancelled
      }

      var weightedEnergy = 0.0
      for channel in 0..<channelCount {
        let sample = channels[channel][frame]
        let shelf = shelfFilters[channel].process(sample)
        let filtered = highPassFilters[channel].process(Float(shelf))
        weightedEnergy += weights[channel] * filtered * filtered
      }

      pushFrameEnergy(weightedEnergy)
    }

    return .ok
  }

  mutating func finish() -> TONIosLoudnessAnalyzerTask.Outcome {
    if blockEnergies.isEmpty, ringCount > 0 {
      blockEnergies.append(runningEnergySum / Double(ringCount))
    }

    let gatedByAbsolute = blockEnergies.filter { energyToLufs($0) >= TONIosLoudnessAnalyzerTask.absoluteGateLufs }
    if gatedByAbsolute.isEmpty {
      return .failed("No valid loudness blocks were measured.")
    }

    let ungatedMean = gatedByAbsolute.reduce(0, +) / Double(gatedByAbsolute.count)
    let relativeThreshold = energyToLufs(ungatedMean) - 10
    let finalEnergies = gatedByAbsolute.filter { energyToLufs($0) >= relativeThreshold }
    let effectiveEnergies = finalEnergies.isEmpty ? gatedByAbsolute : finalEnergies
    let meanEnergy = effectiveEnergies.reduce(0, +) / Double(effectiveEnergies.count)
    let lufs = energyToLufs(meanEnergy)
    let gain = max(-20.0, min(20.0, targetLufs - lufs))
    return .completed(lufs: lufs, gain: gain)
  }

  private mutating func pushFrameEnergy(_ energy: Double) {
    if ringCount < blockFrames {
      ring[ringCount] = energy
      ringCount += 1
      runningEnergySum += energy
    } else {
      runningEnergySum -= ring[ringIndex]
      ring[ringIndex] = energy
      runningEnergySum += energy
      ringIndex = (ringIndex + 1) % blockFrames
    }

    frameCursor += 1
    if ringCount == blockFrames {
      let offset = frameCursor - blockFrames
      if offset % stepFrames == 0 {
        blockEnergies.append(runningEnergySum / Double(blockFrames))
      }
    }
  }

  private func energyToLufs(_ value: Double) -> Double {
    let clamped = max(value, 1e-12)
    return -0.691 + (10.0 * log10(clamped))
  }

  private static func channelWeight(for index: Int) -> Double {
    switch index {
    case 3:
      return 0.0
    case 4, 5:
      return 1.41
    default:
      return 1.0
    }
  }
}

private struct BiquadFilter {
  static let highPass48k = BiquadFilter(
    b0: 1.0,
    b1: -2.0,
    b2: 1.0,
    a1: -1.990_047_454_833_98,
    a2: 0.990_072_250_366_21,
  )

  static let highShelf48k = BiquadFilter(
    b0: 1.535_124_859_586_97,
    b1: -2.691_696_189_406_38,
    b2: 1.198_392_810_852_85,
    a1: -1.690_659_293_182_41,
    a2: 0.732_480_774_215_85,
  )

  let a1: Double
  let a2: Double
  let b0: Double
  let b1: Double
  let b2: Double

  private var z1 = 0.0
  private var z2 = 0.0

  init(b0: Double, b1: Double, b2: Double, a1: Double, a2: Double) {
    self.a1 = a1
    self.a2 = a2
    self.b0 = b0
    self.b1 = b1
    self.b2 = b2
  }

  mutating func process(_ sample: Float) -> Double {
    let x = Double(sample)
    let y = b0 * x + z1
    z1 = b1 * x - a1 * y + z2
    z2 = b2 * x - a2 * y
    return y
  }
}
