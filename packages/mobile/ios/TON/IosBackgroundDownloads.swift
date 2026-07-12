import Foundation
import React

@objc(IosBackgroundDownloads)
final class IosBackgroundDownloads: RCTEventEmitter {
  private let eventName = "iosBackgroundDownload"

  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    [eventName]
  }

  override func startObserving() {
    TONIosBackgroundDownloadsManager.sharedManager().setEventSink { [weak self] payload in
      self?.sendEvent(withName: self?.eventName ?? "iosBackgroundDownload", body: payload)
    }
  }

  override func stopObserving() {
    TONIosBackgroundDownloadsManager.sharedManager().setEventSink(nil)
  }

  @objc(initialize:rejecter:)
  func initialize(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosBackgroundDownloadsManager.sharedManager().initialize {
      resolve(nil)
    }
  }

  @objc(startDownload:resolver:rejecter:)
  func startDownload(
    _ request: [String: Any],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    guard let parsedRequest = TONIosBackgroundDownloadRequest(dictionary: request) else {
      reject("ios_background_invalid_request", "Invalid iOS background download request.", nil)
      return
    }

    TONIosBackgroundDownloadsManager.sharedManager().startDownload(request: parsedRequest) { error in
      if let error {
        reject("ios_background_start_failed", error.localizedDescription, error)
        return
      }

      resolve(nil)
    }
  }

  @objc(beginDownloadActivity:resolver:rejecter:)
  func beginDownloadActivity(
    _ request: [String: Any],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    guard let parsedRequest = TONIosDownloadActivityRequest(dictionary: request) else {
      reject("ios_download_activity_invalid_request", "Invalid iOS download activity request.", nil)
      return
    }

    TONIosDownloadActivityManager.shared.begin(parsedRequest)
    resolve(nil)
  }

  @objc(endDownloadActivity:resolver:rejecter:)
  func endDownloadActivity(
    _ itemId: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosDownloadActivityManager.shared.end(itemId: itemId.intValue)
    resolve(nil)
  }

  @objc(recoverDownload:resolver:rejecter:)
  func recoverDownload(
    _ request: [String: Any],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    guard let parsedRequest = TONIosBackgroundDownloadRequest(dictionary: request) else {
      reject("ios_background_invalid_request", "Invalid iOS background download request.", nil)
      return
    }

    TONIosBackgroundDownloadsManager.sharedManager().recoverDownload(request: parsedRequest) { result in
      switch result {
      case .success(let record):
        resolve(record.asDictionary())
      case .failure(let error):
        reject("ios_background_recovery_failed", error.localizedDescription, error)
      }
    }
  }

  @objc(cancelDownload:resolver:rejecter:)
  func cancelDownload(
    _ itemId: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosBackgroundDownloadsManager.sharedManager().cancelDownload(itemId: itemId.intValue) {
      resolve(nil)
    }
  }

  @objc(getSnapshot:rejecter:)
  func getSnapshot(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosBackgroundDownloadsManager.sharedManager().getSnapshot { items in
      resolve(["items": items])
    }
  }

  @objc(acknowledgeSettled:resolver:rejecter:)
  func acknowledgeSettled(
    _ itemId: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosBackgroundDownloadsManager.sharedManager().acknowledgeSettled(itemId: itemId.intValue) {
      resolve(nil)
    }
  }
}
