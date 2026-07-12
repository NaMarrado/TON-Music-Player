import Foundation
import React

@objc(IosLoudnessAnalyzer)
final class IosLoudnessAnalyzer: RCTEventEmitter {
  private let eventName = "iosLoudnessAnalysisEvent"

  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    [eventName]
  }

  override func startObserving() {
    TONIosLoudnessAnalyzerManager.sharedManager().setEventSink { [weak self] payload in
      self?.sendEvent(withName: self?.eventName ?? "iosLoudnessAnalysisEvent", body: payload)
    }
  }

  override func stopObserving() {
    TONIosLoudnessAnalyzerManager.sharedManager().setEventSink(nil)
  }

  @objc(startAnalysis:targetLufs:resolver:rejecter:)
  func startAnalysis(
    _ filePath: String,
    targetLufs: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosLoudnessAnalyzerManager.sharedManager().startAnalysis(
      filePath: filePath,
      targetLufs: targetLufs.doubleValue,
    ) { taskId, error in
      if let error {
        reject("ios_loudness_start_failed", error.localizedDescription, error)
        return
      }

      resolve(taskId)
    }
  }

  @objc(cancelAnalysis:resolver:rejecter:)
  func cancelAnalysis(
    _ taskId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosLoudnessAnalyzerManager.sharedManager().cancelAnalysis(taskId: taskId) {
      resolve(nil)
    }
  }
}
