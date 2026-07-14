import Foundation
import React

extension IosPlaybackEngine {
  @objc(setPitch:resolver:rejecter:)
  func setPitch(_ ratio: NSNumber, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().setPitch(ratio.doubleValue) { resolve(nil) }
  }

  @objc(getAudioSessionId:rejecter:)
  func getAudioSessionId(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().getAudioSessionId { resolve($0) }
  }

  @objc(attachEqualizer:resolver:rejecter:)
  func attachEqualizer(_ sessionId: NSNumber, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().attachEqualizer(sessionId: sessionId.intValue) { resolve($0) }
  }

  @objc(setEqEnabled:resolver:rejecter:)
  func setEqEnabled(_ enabled: Bool, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().setEqEnabled(enabled) { resolve(nil) }
  }

  @objc(setEqBandLevel:level:resolver:rejecter:)
  func setEqBandLevel(_ index: NSNumber, level: NSNumber, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().setEqBandLevel(index: index.intValue, level: level.intValue) { resolve(nil) }
  }

  @objc(getEqBandCount:rejecter:)
  func getEqBandCount(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().getEqBandCount { resolve($0) }
  }

  @objc(getEqBandFrequencies:rejecter:)
  func getEqBandFrequencies(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().getEqBandFrequencies { resolve($0) }
  }

  @objc(getEqBandLevelRange:rejecter:)
  func getEqBandLevelRange(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().getEqBandLevelRange { resolve($0) }
  }

  @objc(attachAudioBoost:resolver:rejecter:)
  func attachAudioBoost(_ sessionId: NSNumber, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().attachAudioBoost(sessionId: sessionId.intValue) { resolve(nil) }
  }

  @objc(setAudioBoostTargetGain:resolver:rejecter:)
  func setAudioBoostTargetGain(_ value: NSNumber, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().setAudioBoostTargetGain(value.intValue) { resolve(nil) }
  }

  @objc(releaseAudioBoost:rejecter:)
  func releaseAudioBoost(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().releaseAudioBoost { resolve(nil) }
  }
}
