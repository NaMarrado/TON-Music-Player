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

  @objc(setupPlayer:rejecter:)
  func setupPlayer(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().initialize { error in
      if let error {
        reject("ios_playback_setup_failed", error.localizedDescription, error)
        return
      }

      resolve(nil)
    }
  }

  @objc(updateOptions:resolver:rejecter:)
  func updateOptions(
    _ options: [String: Any],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().updateOptions(options) {
      resolve(nil)
    }
  }

  @objc(setQueue:resolver:rejecter:)
  func setQueue(
    _ tracks: [[String: Any]],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    let parsedTracks = tracks.compactMap(TONIosPlaybackTrack.init(dictionary:))
    TONIosPlaybackEngineManager.sharedManager().setQueue(parsedTracks) { error in
      if let error {
        reject("ios_playback_set_queue_failed", error.localizedDescription, error)
        return
      }

      resolve(nil)
    }
  }

  @objc(add:resolver:rejecter:)
  func add(
    _ tracks: [[String: Any]],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    let parsedTracks = tracks.compactMap(TONIosPlaybackTrack.init(dictionary:))
    TONIosPlaybackEngineManager.sharedManager().addTracks(parsedTracks) {
      resolve(nil)
    }
  }

  @objc(load:resolver:rejecter:)
  func load(
    _ track: [String: Any],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    guard let parsedTrack = TONIosPlaybackTrack(dictionary: track) else {
      reject("ios_playback_invalid_track", "Invalid iOS playback track.", nil)
      return
    }

    TONIosPlaybackEngineManager.sharedManager().loadTrack(parsedTrack) { error in
      if let error {
        reject("ios_playback_load_failed", error.localizedDescription, error)
        return
      }

      resolve(nil)
    }
  }

  @objc(play:rejecter:)
  func play(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().play { error in
      if let error {
        reject("ios_playback_play_failed", error.localizedDescription, error)
        return
      }

      resolve(nil)
    }
  }

  @objc(pause:rejecter:)
  func pause(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().pause {
      resolve(nil)
    }
  }

  @objc(stop:rejecter:)
  func stop(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().stop {
      resolve(nil)
    }
  }

  @objc(seekTo:resolver:rejecter:)
  func seekTo(
    _ position: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().seek(to: position.doubleValue) { error in
      if let error {
        reject("ios_playback_seek_failed", error.localizedDescription, error)
        return
      }

      resolve(nil)
    }
  }

  @objc(setVolume:resolver:rejecter:)
  func setVolume(
    _ volume: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().setVolume(volume.floatValue) {
      resolve(nil)
    }
  }

  @objc(setRepeatMode:resolver:rejecter:)
  func setRepeatMode(
    _ mode: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().setRepeatMode(mode.intValue) {
      resolve(nil)
    }
  }

  @objc(skip:resolver:rejecter:)
  func skip(
    _ index: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().skip(to: index.intValue) { error in
      if let error {
        reject("ios_playback_skip_failed", error.localizedDescription, error)
        return
      }

      resolve(nil)
    }
  }

  @objc(skipToNext:rejecter:)
  func skipToNext(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().skipToNext { error in
      if let error {
        reject("ios_playback_skip_next_failed", error.localizedDescription, error)
        return
      }

      resolve(nil)
    }
  }

  @objc(skipToPrevious:rejecter:)
  func skipToPrevious(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().skipToPrevious { error in
      if let error {
        reject("ios_playback_skip_previous_failed", error.localizedDescription, error)
        return
      }

      resolve(nil)
    }
  }

  @objc(removeUpcomingTracks:rejecter:)
  func removeUpcomingTracks(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().removeUpcomingTracks {
      resolve(nil)
    }
  }

  @objc(getPosition:rejecter:)
  func getPosition(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().getPosition { position in
      resolve(position)
    }
  }

  @objc(getProgress:rejecter:)
  func getProgress(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().getProgress { progress in
      resolve(progress)
    }
  }

  @objc(getPlaybackState:rejecter:)
  func getPlaybackState(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().getPlaybackState { state in
      resolve(state)
    }
  }

  @objc(getActiveTrack:rejecter:)
  func getActiveTrack(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().getActiveTrack { track in
      resolve(track)
    }
  }

  @objc(getActiveTrackIndex:rejecter:)
  func getActiveTrackIndex(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().getActiveTrackIndex { index in
      resolve(index)
    }
  }

  @objc(setPitch:resolver:rejecter:)
  func setPitch(
    _ ratio: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().setPitch(ratio.doubleValue) {
      resolve(nil)
    }
  }

  @objc(getAudioSessionId:rejecter:)
  func getAudioSessionId(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().getAudioSessionId { sessionId in
      resolve(sessionId)
    }
  }

  @objc(attachEqualizer:resolver:rejecter:)
  func attachEqualizer(
    _ sessionId: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().attachEqualizer(sessionId: sessionId.intValue) { info in
      resolve(info)
    }
  }

  @objc(setEqEnabled:resolver:rejecter:)
  func setEqEnabled(
    _ enabled: Bool,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().setEqEnabled(enabled) {
      resolve(nil)
    }
  }

  @objc(setEqBandLevel:level:resolver:rejecter:)
  func setEqBandLevel(
    _ index: NSNumber,
    level: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().setEqBandLevel(
      index: index.intValue,
      level: level.intValue,
    ) {
      resolve(nil)
    }
  }

  @objc(getEqBandCount:rejecter:)
  func getEqBandCount(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().getEqBandCount { value in
      resolve(value)
    }
  }

  @objc(getEqBandFrequencies:rejecter:)
  func getEqBandFrequencies(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().getEqBandFrequencies { values in
      resolve(values)
    }
  }

  @objc(getEqBandLevelRange:rejecter:)
  func getEqBandLevelRange(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().getEqBandLevelRange { range in
      resolve(range)
    }
  }

  @objc(attachAudioBoost:resolver:rejecter:)
  func attachAudioBoost(
    _ sessionId: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().attachAudioBoost(sessionId: sessionId.intValue) {
      resolve(nil)
    }
  }

  @objc(setAudioBoostTargetGain:resolver:rejecter:)
  func setAudioBoostTargetGain(
    _ value: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().setAudioBoostTargetGain(value.intValue) {
      resolve(nil)
    }
  }

  @objc(releaseAudioBoost:rejecter:)
  func releaseAudioBoost(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosPlaybackEngineManager.sharedManager().releaseAudioBoost {
      resolve(nil)
    }
  }
}
