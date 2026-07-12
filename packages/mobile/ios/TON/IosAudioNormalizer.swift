import AVFoundation
import Foundation
import React

@objc(IosAudioNormalizer)
final class IosAudioNormalizer: NSObject {
  private let operationLock = NSLock()
  private var activeReaders: [String: AVAssetReader] = [:]
  private var activeWriters: [String: AVAssetWriter] = [:]
  private var activeExports: [String: AVAssetExportSession] = [:]
  private var activeOutputs: [String: URL] = [:]
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(normalize:targetBitRate:operationId:resolver:rejecter:)
  func normalize(
    _ filePath: String,
    targetBitRate: NSNumber,
    operationId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    let inputURL = resolveFileURL(from: filePath)

    let requestedBitRate = max(0, targetBitRate.intValue)
    if requestedBitRate == 0 && canOpenWithAVAudioFile(inputURL) {
      resolve([
        "filePath": filePath,
        "format": "m4a",
      ])
      return
    }

    let asset = AVURLAsset(url: inputURL)
    let outputURL = inputURL
      .deletingLastPathComponent()
      .appendingPathComponent("\(inputURL.deletingPathExtension().lastPathComponent).normalized-\(UUID().uuidString).m4a")

    if requestedBitRate > 0 {
      remuxAsset(
        asset,
        outputURL: outputURL,
        targetBitRate: requestedBitRate,
        operationId: operationId,
        resolve: resolve,
        reject: reject,
        fallbackError: nil,
      )
      return
    }

    guard let exportSession = AVAssetExportSession(
      asset: asset,
      presetName: AVAssetExportPresetAppleM4A,
    ) else {
      reject(
        "ios_audio_normalizer_export_unavailable",
        "Unable to create iOS audio export session.",
        nil,
      )
      return
    }

    exportSession.outputURL = outputURL
    exportSession.outputFileType = .m4a
    exportSession.shouldOptimizeForNetworkUse = false
    register(operationId: operationId, exportSession: exportSession, outputURL: outputURL)

    try? FileManager.default.removeItem(at: outputURL)
    exportSession.exportAsynchronously {
      self.clearOperation(operationId)
      switch exportSession.status {
      case .completed:
        self.completeExport(
          outputURL: outputURL,
          resolve: resolve,
          reject: reject,
        )
      case .cancelled:
        try? FileManager.default.removeItem(at: outputURL)
        reject(
          "ios_audio_normalizer_cancelled",
          "iOS audio normalization was cancelled.",
          nil,
        )
      default:
        try? FileManager.default.removeItem(at: outputURL)
        self.remuxAsset(
          asset,
          outputURL: outputURL,
          targetBitRate: 0,
          operationId: operationId,
          resolve: resolve,
          reject: reject,
          fallbackError: exportSession.error,
        )
      }
    }
  }

  private func remuxAsset(
    _ asset: AVURLAsset,
    outputURL: URL,
    targetBitRate: Int,
    operationId: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock,
    fallbackError: Error?,
  ) {
    let keys = ["tracks", "duration", "playable"]
    asset.loadValuesAsynchronously(forKeys: keys) {
      do {
        for key in keys {
          var error: NSError?
          let status = asset.statusOfValue(forKey: key, error: &error)
          if status == .failed || status == .cancelled {
            throw error ?? fallbackError ?? NSError(
              domain: "IosAudioNormalizer",
              code: 3,
              userInfo: [NSLocalizedDescriptionKey: "Unable to load audio asset key \(key)."],
            )
          }
        }

        guard let audioTrack = asset.tracks(withMediaType: .audio).first else {
          throw fallbackError ?? NSError(
            domain: "IosAudioNormalizer",
            code: 4,
            userInfo: [NSLocalizedDescriptionKey: "Audio asset does not contain an audio track."],
          )
        }

        try self.remuxAudioTrack(
          audioTrack,
          asset: asset,
          outputURL: outputURL,
          targetBitRate: targetBitRate,
          operationId: operationId,
          resolve: resolve,
          reject: reject,
        )
      } catch {
        try? FileManager.default.removeItem(at: outputURL)
        let fallbackMessage = fallbackError?.localizedDescription
        let message = fallbackMessage == nil
          ? error.localizedDescription
          : "\(error.localizedDescription) (export fallback: \(fallbackMessage!))"
        reject("ios_audio_normalizer_failed", message, error)
      }
    }
  }

  private func remuxAudioTrack(
    _ audioTrack: AVAssetTrack,
    asset: AVURLAsset,
    outputURL: URL,
    targetBitRate: Int,
    operationId: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock,
  ) throws {
    try? FileManager.default.removeItem(at: outputURL)

    let reader = try AVAssetReader(asset: asset)
    let writer = try AVAssetWriter(outputURL: outputURL, fileType: .m4a)
    let readerSettings: [String: Any]? = targetBitRate > 0
      ? [AVFormatIDKey: kAudioFormatLinearPCM]
      : nil
    let readerOutput = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: readerSettings)
    readerOutput.alwaysCopiesSampleData = false

    let sourceFormatHint = audioTrack.formatDescriptions.first.map { $0 as! CMFormatDescription }
    let writerSettings = makeWriterSettings(
      sourceFormatHint: sourceFormatHint,
      targetBitRate: targetBitRate,
    )
    let writerInput = AVAssetWriterInput(
      mediaType: .audio,
      outputSettings: writerSettings,
      sourceFormatHint: targetBitRate > 0 ? nil : sourceFormatHint,
    )
    writerInput.expectsMediaDataInRealTime = false
    guard reader.canAdd(readerOutput) else {
      throw NSError(
        domain: "IosAudioNormalizer",
        code: 5,
        userInfo: [NSLocalizedDescriptionKey: "Unable to attach audio reader output."],
      )
    }
    reader.add(readerOutput)

    guard writer.canAdd(writerInput) else {
      throw NSError(
        domain: "IosAudioNormalizer",
        code: 6,
        userInfo: [NSLocalizedDescriptionKey: "Unable to attach audio writer input."],
      )
    }
    writer.add(writerInput)
    register(operationId: operationId, reader: reader, writer: writer, outputURL: outputURL)

    guard writer.startWriting() else {
      clearOperation(operationId)
      throw writer.error ?? NSError(
        domain: "IosAudioNormalizer",
        code: 7,
        userInfo: [NSLocalizedDescriptionKey: "Unable to start audio writer."],
      )
    }

    guard reader.startReading() else {
      writer.cancelWriting()
      clearOperation(operationId)
      throw reader.error ?? NSError(
        domain: "IosAudioNormalizer",
        code: 8,
        userInfo: [NSLocalizedDescriptionKey: "Unable to start audio reader."],
      )
    }

    writer.startSession(atSourceTime: .zero)

    let queue = DispatchQueue(label: "com.ton.player.ios-audio-normalizer")
    writerInput.requestMediaDataWhenReady(on: queue) {
      while writerInput.isReadyForMoreMediaData {
        if let sampleBuffer = readerOutput.copyNextSampleBuffer() {
          if !writerInput.append(sampleBuffer) {
            reader.cancelReading()
            writerInput.markAsFinished()
            writer.cancelWriting()
            self.clearOperation(operationId)
            try? FileManager.default.removeItem(at: outputURL)
            reject(
              "ios_audio_normalizer_failed",
              writer.error?.localizedDescription ?? "Unable to write normalized audio sample.",
              writer.error,
            )
            return
          }
          continue
        }

        writerInput.markAsFinished()
        writer.finishWriting {
          self.clearOperation(operationId)
          if reader.status == .failed || reader.status == .cancelled {
            try? FileManager.default.removeItem(at: outputURL)
            reject(
              "ios_audio_normalizer_failed",
              reader.error?.localizedDescription ?? "Unable to read source audio samples.",
              reader.error,
            )
            return
          }

          if writer.status != .completed {
            try? FileManager.default.removeItem(at: outputURL)
            reject(
              "ios_audio_normalizer_failed",
              writer.error?.localizedDescription ?? "Unable to finish normalized audio writer.",
              writer.error,
            )
            return
          }

          self.completeExport(
            outputURL: outputURL,
            resolve: resolve,
            reject: reject,
          )
        }
        return
      }
    }
  }

  @objc(cancel:resolver:rejecter:)
  func cancel(
    _ operationId: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter _: RCTPromiseRejectBlock,
  ) {
    operationLock.lock()
    let reader = activeReaders.removeValue(forKey: operationId)
    let writer = activeWriters.removeValue(forKey: operationId)
    let exportSession = activeExports.removeValue(forKey: operationId)
    let outputURL = activeOutputs.removeValue(forKey: operationId)
    operationLock.unlock()
    reader?.cancelReading()
    writer?.cancelWriting()
    exportSession?.cancelExport()
    if let outputURL { try? FileManager.default.removeItem(at: outputURL) }
    resolve(nil)
  }

  private func register(
    operationId: String,
    reader: AVAssetReader,
    writer: AVAssetWriter,
    outputURL: URL,
  ) {
    operationLock.lock()
    activeReaders[operationId] = reader
    activeWriters[operationId] = writer
    activeOutputs[operationId] = outputURL
    operationLock.unlock()
  }

  private func register(
    operationId: String,
    exportSession: AVAssetExportSession,
    outputURL: URL,
  ) {
    operationLock.lock()
    activeExports[operationId] = exportSession
    activeOutputs[operationId] = outputURL
    operationLock.unlock()
  }

  private func clearOperation(_ operationId: String) {
    operationLock.lock()
    activeReaders.removeValue(forKey: operationId)
    activeWriters.removeValue(forKey: operationId)
    activeExports.removeValue(forKey: operationId)
    activeOutputs.removeValue(forKey: operationId)
    operationLock.unlock()
  }

  private func makeWriterSettings(
    sourceFormatHint: CMFormatDescription?,
    targetBitRate: Int,
  ) -> [String: Any]? {
    guard targetBitRate > 0 else { return nil }

    let description = sourceFormatHint.flatMap {
      CMAudioFormatDescriptionGetStreamBasicDescription($0)?.pointee
    }
    let sampleRate = description?.mSampleRate ?? 44_100
    let channelCount = min(2, max(1, Int(description?.mChannelsPerFrame ?? 2)))
    return [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVEncoderBitRateKey: targetBitRate,
      AVSampleRateKey: sampleRate,
      AVNumberOfChannelsKey: channelCount,
    ]
  }

  private func completeExport(
    outputURL: URL,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock,
  ) {
    do {
      if !FileManager.default.fileExists(atPath: outputURL.path) {
        throw NSError(
          domain: "IosAudioNormalizer",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Normalized audio output was not created."],
        )
      }

      if !canOpenWithAVAudioFile(outputURL) {
        throw NSError(
          domain: "IosAudioNormalizer",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Normalized audio is still not readable by AVAudioFile."],
        )
      }

      resolve([
        "filePath": outputURL.absoluteString,
        "format": "m4a",
      ])
    } catch {
      try? FileManager.default.removeItem(at: outputURL)
      reject("ios_audio_normalizer_replace_failed", error.localizedDescription, error)
    }
  }

  private func canOpenWithAVAudioFile(_ url: URL) -> Bool {
    do {
      _ = try AVAudioFile(forReading: url)
      return true
    } catch {
      return false
    }
  }

  private func resolveFileURL(from path: String) -> URL {
    if path.hasPrefix("file://"), let url = URL(string: path) {
      return url
    }

    return URL(fileURLWithPath: path)
  }
}
