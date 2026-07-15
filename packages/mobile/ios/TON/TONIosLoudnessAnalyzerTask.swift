import AVFoundation
import Foundation

final class TONIosLoudnessAnalyzerTask {
  enum Outcome {
    case cancelled
    case completed(lufs: Double, gain: Double)
    case failed(String)
  }

  static let absoluteGateLufs = -70.0
  static let blockDurationSeconds = 0.4
  static let outputSampleRate = 48_000.0
  static let stepDurationSeconds = 0.1

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
    stateQueue.sync { cancelled = true }
  }

  func run() -> Outcome {
    guard let fileURL = resolvedFileURL() else { return .failed("Invalid audio file path.") }
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

      var integrator = LoudnessIntegrator(channelCount: channelCount, targetLufs: targetLufs)
      var inputError: Error?
      var reachedEndOfStream = false
      while true {
        if isCancelled { return .cancelled }
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
            let frameCount = AVAudioFrameCount(min(Int64(inputBuffer.frameCapacity), remainingFrames))
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

        if isCancelled { return .cancelled }
        if let inputError { return .failed(inputError.localizedDescription) }
        if let conversionError { return .failed(conversionError.localizedDescription) }
        if outputBuffer.frameLength > 0 {
          switch integrator.consume(buffer: outputBuffer, isCancelled: { self.isCancelled }) {
          case .cancelled: return .cancelled
          case let .failed(message): return .failed(message)
          case .ok: break
          }
        }
        switch status {
        case .error: return .failed("Audio conversion failed.")
        case .endOfStream: return integrator.finish()
        case .haveData, .inputRanDry: continue
        @unknown default: return .failed("Unknown audio conversion status.")
        }
      }
    } catch {
      return .failed(error.localizedDescription)
    }
  }

  private var isCancelled: Bool { stateQueue.sync { cancelled } }

  private func resolvedFileURL() -> URL? {
    if filePath.hasPrefix("file://") { return URL(string: filePath) }
    return URL(fileURLWithPath: filePath)
  }
}
