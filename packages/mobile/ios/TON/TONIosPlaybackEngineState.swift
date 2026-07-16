import Foundation
import MediaPlayer
import UIKit

extension TONIosPlaybackEngineManager {
  func updateNowPlayingInfo() {
    applyRemoteCommandCapabilities()
    let center = MPNowPlayingInfoCenter.default()
    guard shouldPublishNowPlayingInfo,
          let currentIndex,
          currentIndex >= 0,
          currentIndex < queue.count else {
      center.nowPlayingInfo = nil
      return
    }
    let track = queue[currentIndex]
    var info: [String: Any] = [
      MPMediaItemPropertyTitle: track.title,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: currentPositionSeconds(),
      MPNowPlayingInfoPropertyPlaybackRate: state == "playing" ? 1 : 0,
    ]
    if let artist = track.artist, !artist.isEmpty { info[MPMediaItemPropertyArtist] = artist }
    if let album = track.album, !album.isEmpty { info[MPMediaItemPropertyAlbumTitle] = album }
    if currentDurationSeconds > 0 { info[MPMediaItemPropertyPlaybackDuration] = currentDurationSeconds }
    if let artworkURL = track.resolvedArtworkURL(),
       let image = UIImage(contentsOfFile: artworkURL.path) {
      info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(
        boundsSize: image.size,
        requestHandler: { _ in image }
      )
    }
    center.nowPlayingInfo = info
  }

  var shouldPublishNowPlayingInfo: Bool {
    state == "playing" || state == "paused" || state == "loading"
  }

  func applyPitch() {
    guard engineConfigured else { return }
    timePitchNode.rate = 1
    timePitchNode.pitch = Float(1200 * log2(Double(max(0.25, min(pitchRatio, 4)))))
  }

  func applyEqualizerState() {
    guard engineConfigured else { return }
    for (index, band) in equalizerNode.bands.enumerated() {
      band.filterType = .parametric
      band.frequency = Float(Self.eqFrequencies[index])
      band.bandwidth = 1
      band.gain = eqEnabled ? Float(eqBandLevelsMb[index]) / 100 : 0
      band.bypass = !eqEnabled
    }
  }

  func applyAudioBoost() {
    guard engineConfigured else { return }
    equalizerNode.globalGain = Float(audioBoostGainMb) / 100
  }

  func emitEvent(type: String, extra: [String: Any] = [:]) {
    var payload = extra
    payload["type"] = type
    DispatchQueue.main.async { self.eventSink?(payload) }
  }

  func emitPlaybackState() {
    var payload: [String: Any] = ["state": state]
    if let currentIndex, currentIndex >= 0, currentIndex < queue.count {
      payload["trackId"] = queue[currentIndex].id
    }
    emitEvent(type: "playback-state", extra: payload)
  }

  func emitActiveTrack() {
    guard let currentIndex,
          currentIndex >= 0,
          currentIndex < queue.count else { return }
    emitEvent(
      type: "playback-active-track-changed",
      extra: ["index": currentIndex, "track": queue[currentIndex].asDictionary()]
    )
  }

  func emitPlaybackSnapshot() {
    emitActiveTrack()
    emitPlaybackState()
  }

  func failPlayback(_ error: Error) {
    scheduleToken += 1
    if engineConfigured { playerNode.stop() }
    state = "error"
    updateNowPlayingInfo()
    deactivateAudioSessionIfNeeded()
    emitPlaybackState()
    emitEvent(type: "playback-error", extra: ["message": error.localizedDescription])
  }

  func resetPlaybackState(keepQueue: Bool) {
    scheduleToken += 1
    if engineConfigured { playerNode.stop() }
    currentDurationSeconds = 0
    currentFile = nil
    currentIndex = nil
    resumePositionSeconds = 0
    scheduledOffsetSeconds = 0
    state = "none"
    if !keepQueue { queue = [] }
    updateNowPlayingInfo()
    deactivateAudioSessionIfNeeded()
    emitPlaybackState()
  }
}
