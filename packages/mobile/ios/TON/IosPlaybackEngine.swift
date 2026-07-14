import Foundation
import React

@objc(IosPlaybackEngine)
final class IosPlaybackEngine: RCTEventEmitter {
  private let eventName = "iosPlaybackEvent"

  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    [eventName]
  }

  override func startObserving() {
    TONIosPlaybackEngineManager.sharedManager().setEventSink { [weak self] payload in
      self?.sendEvent(withName: self?.eventName ?? "iosPlaybackEvent", body: payload)
    }
  }

  override func stopObserving() {
    TONIosPlaybackEngineManager.sharedManager().setEventSink(nil)
  }
}
