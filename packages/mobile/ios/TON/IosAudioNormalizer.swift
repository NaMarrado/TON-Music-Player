import AVFoundation
import Foundation
import React

@objc(IosAudioNormalizer)
final class IosAudioNormalizer: NSObject {
  let operationLock = NSLock()
  var activeReaders: [String: AVAssetReader] = [:]
  var activeWriters: [String: AVAssetWriter] = [:]
  var activeExports: [String: AVAssetExportSession] = [:]
  var activeOutputs: [String: URL] = [:]

  @objc
  static func requiresMainQueueSetup() -> Bool { false }

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
      resolve(["filePath": filePath, "format": "m4a"])
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
        self.completeExport(outputURL: outputURL, resolve: resolve, reject: reject)
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
}
