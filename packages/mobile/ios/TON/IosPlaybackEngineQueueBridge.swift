import Foundation
import React

extension IosPlaybackEngine {
  @objc(setupPlayer:rejecter:)
  func setupPlayer(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().initialize { error in
      if let error { reject("ios_playback_setup_failed", error.localizedDescription, error); return }
      resolve(nil)
    }
  }

  @objc(updateOptions:resolver:rejecter:)
  func updateOptions(_ options: [String: Any], resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().updateOptions(options) { resolve(nil) }
  }

  @objc(setQueue:resolver:rejecter:)
  func setQueue(_ tracks: [[String: Any]], resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let parsedTracks = tracks.compactMap(TONIosPlaybackTrack.init(dictionary:))
    TONIosPlaybackEngineManager.sharedManager().setQueue(parsedTracks) { error in
      if let error { reject("ios_playback_set_queue_failed", error.localizedDescription, error); return }
      resolve(nil)
    }
  }

  @objc(add:resolver:rejecter:)
  func add(_ tracks: [[String: Any]], resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let parsedTracks = tracks.compactMap(TONIosPlaybackTrack.init(dictionary:))
    TONIosPlaybackEngineManager.sharedManager().addTracks(parsedTracks) { resolve(nil) }
  }

  @objc(load:resolver:rejecter:)
  func load(_ track: [String: Any], resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let parsedTrack = TONIosPlaybackTrack(dictionary: track) else {
      reject("ios_playback_invalid_track", "Invalid iOS playback track.", nil); return
    }
    TONIosPlaybackEngineManager.sharedManager().loadTrack(parsedTrack) { error in
      if let error { reject("ios_playback_load_failed", error.localizedDescription, error); return }
      resolve(nil)
    }
  }

  @objc(play:rejecter:)
  func play(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().play { error in
      if let error { reject("ios_playback_play_failed", error.localizedDescription, error); return }
      resolve(nil)
    }
  }

  @objc(pause:rejecter:)
  func pause(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().pause { resolve(nil) }
  }

  @objc(stop:rejecter:)
  func stop(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().stop { resolve(nil) }
  }

  @objc(seekTo:resolver:rejecter:)
  func seekTo(_ position: NSNumber, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().seek(to: position.doubleValue) { error in
      if let error { reject("ios_playback_seek_failed", error.localizedDescription, error); return }
      resolve(nil)
    }
  }

  @objc(setVolume:resolver:rejecter:)
  func setVolume(_ volume: NSNumber, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().setVolume(volume.floatValue) { resolve(nil) }
  }

  @objc(setRepeatMode:resolver:rejecter:)
  func setRepeatMode(_ mode: NSNumber, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().setRepeatMode(mode.intValue) { resolve(nil) }
  }

  @objc(skip:resolver:rejecter:)
  func skip(_ index: NSNumber, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().skip(to: index.intValue) { error in
      if let error { reject("ios_playback_skip_failed", error.localizedDescription, error); return }
      resolve(nil)
    }
  }

  @objc(skipToNext:rejecter:)
  func skipToNext(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().skipToNext { error in
      if let error { reject("ios_playback_skip_next_failed", error.localizedDescription, error); return }
      resolve(nil)
    }
  }

  @objc(skipToPrevious:rejecter:)
  func skipToPrevious(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().skipToPrevious { error in
      if let error { reject("ios_playback_skip_previous_failed", error.localizedDescription, error); return }
      resolve(nil)
    }
  }

  @objc(removeUpcomingTracks:rejecter:)
  func removeUpcomingTracks(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().removeUpcomingTracks { resolve(nil) }
  }

  @objc(getPosition:rejecter:)
  func getPosition(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().getPosition { resolve($0) }
  }

  @objc(getProgress:rejecter:)
  func getProgress(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().getProgress { resolve($0) }
  }

  @objc(getPlaybackState:rejecter:)
  func getPlaybackState(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().getPlaybackState { resolve($0) }
  }

  @objc(getActiveTrack:rejecter:)
  func getActiveTrack(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().getActiveTrack { resolve($0) }
  }

  @objc(getActiveTrackIndex:rejecter:)
  func getActiveTrackIndex(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    TONIosPlaybackEngineManager.sharedManager().getActiveTrackIndex { resolve($0) }
  }
}
