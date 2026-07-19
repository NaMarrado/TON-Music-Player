import AVFoundation
import Foundation
import React

extension IosAudioNormalizer {
  func remuxAsset(
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

  func remuxAudioTrack(
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
    let writerInput = AVAssetWriterInput(
      mediaType: .audio,
      outputSettings: makeWriterSettings(sourceFormatHint: sourceFormatHint, targetBitRate: targetBitRate),
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
    let queue = DispatchQueue(label: "cz.ton.player.ios-audio-normalizer")
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
          self.completeExport(outputURL: outputURL, resolve: resolve, reject: reject)
        }
        return
      }
    }
  }
}
