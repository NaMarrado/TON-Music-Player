import AVFoundation
import Foundation
import React

extension IosAudioNormalizer {
  func register(
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

  func register(
    operationId: String,
    exportSession: AVAssetExportSession,
    outputURL: URL,
  ) {
    operationLock.lock()
    activeExports[operationId] = exportSession
    activeOutputs[operationId] = outputURL
    operationLock.unlock()
  }

  func clearOperation(_ operationId: String) {
    operationLock.lock()
    activeReaders.removeValue(forKey: operationId)
    activeWriters.removeValue(forKey: operationId)
    activeExports.removeValue(forKey: operationId)
    activeOutputs.removeValue(forKey: operationId)
    operationLock.unlock()
  }

  func makeWriterSettings(
    sourceFormatHint: CMFormatDescription?,
    targetBitRate: Int,
  ) -> [String: Any]? {
    guard targetBitRate > 0 else { return nil }
    let description = sourceFormatHint.flatMap {
      CMAudioFormatDescriptionGetStreamBasicDescription($0)?.pointee
    }
    return [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVEncoderBitRateKey: targetBitRate,
      AVSampleRateKey: description?.mSampleRate ?? 44_100,
      AVNumberOfChannelsKey: min(2, max(1, Int(description?.mChannelsPerFrame ?? 2))),
    ]
  }

  func completeExport(
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
      resolve(["filePath": outputURL.absoluteString, "format": "m4a"])
    } catch {
      try? FileManager.default.removeItem(at: outputURL)
      reject("ios_audio_normalizer_replace_failed", error.localizedDescription, error)
    }
  }

  func canOpenWithAVAudioFile(_ url: URL) -> Bool {
    do {
      _ = try AVAudioFile(forReading: url)
      return true
    } catch {
      return false
    }
  }

  func resolveFileURL(from path: String) -> URL {
    if path.hasPrefix("file://"), let url = URL(string: path) { return url }
    return URL(fileURLWithPath: path)
  }
}
