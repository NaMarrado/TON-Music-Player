import Foundation
import MediaPlayer
import UIKit

private let nowPlayingArtworkCache = NSCache<NSString, UIImage>()
private let nowPlayingArtworkQueue = DispatchQueue(
  label: "cz.ton.player.now-playing-artwork",
  qos: .userInitiated
)

extension TONIosPlaybackEngineManager {
  func updateNowPlayingInfo() {
    // Accessories snapshot available commands when Now Playing metadata changes.
    // Publish capabilities first so a restored session exposes every control.
    applyRemoteCommandCapabilities()
    guard shouldPublishNowPlayingInfo,
          let currentIndex,
          currentIndex >= 0,
          currentIndex < queue.count else {
      performNowPlayingUpdate {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
      }
      return
    }
    let track = queue[currentIndex]
    var info: [String: Any] = [
      MPMediaItemPropertyTitle: track.title,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: currentPositionSeconds(),
      MPNowPlayingInfoPropertyPlaybackRate: state == "playing" ? 1 : 0,
      MPNowPlayingInfoPropertyDefaultPlaybackRate: 1,
      MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
    ]
    if let artist = track.artist, !artist.isEmpty { info[MPMediaItemPropertyArtist] = artist }
    if let album = track.album, !album.isEmpty { info[MPMediaItemPropertyAlbumTitle] = album }
    if currentDurationSeconds > 0 { info[MPMediaItemPropertyPlaybackDuration] = currentDurationSeconds }
    if let queueIndex = track.playbackQueueIndex,
       let queueCount = track.playbackQueueCount,
       queueIndex >= 0,
       queueIndex < queueCount {
      info[MPNowPlayingInfoPropertyPlaybackQueueIndex] = queueIndex
      info[MPNowPlayingInfoPropertyPlaybackQueueCount] = queueCount
    }
    if let artworkURL = track.resolvedArtworkURL() {
      let cacheKey = artworkURL.path as NSString
      if let image = nowPlayingArtworkCache.object(forKey: cacheKey) {
        info[MPMediaItemPropertyArtwork] = makeNowPlayingArtwork(image)
      } else {
        loadNowPlayingArtwork(
          at: artworkURL
        )
      }
    }
    performNowPlayingUpdate {
      MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
    // Reapply after publishing for accessories that refresh commands separately.
    applyRemoteCommandCapabilities()
  }

  private func makeNowPlayingArtwork(_ image: UIImage) -> MPMediaItemArtwork {
    MPMediaItemArtwork(boundsSize: image.size, requestHandler: { _ in image })
  }

  private func loadNowPlayingArtwork(at artworkURL: URL) {
    let path = artworkURL.path
    guard !pendingArtworkPaths.contains(path) else { return }
    pendingArtworkPaths.insert(path)

    nowPlayingArtworkQueue.async { [weak self] in
      let image = UIImage(contentsOfFile: path)
      if let image {
        nowPlayingArtworkCache.setObject(image, forKey: path as NSString)
      }
      self?.stateQueue.async {
        guard let self else { return }
        self.pendingArtworkPaths.remove(path)
        guard let image,
              self.shouldPublishNowPlayingInfo,
              let currentIndex = self.currentIndex,
              self.queue.indices.contains(currentIndex),
              self.queue[currentIndex].resolvedArtworkURL()?.path == path else { return }
        self.performNowPlayingUpdate {
          var currentInfo = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
          currentInfo[MPMediaItemPropertyArtwork] = self.makeNowPlayingArtwork(image)
          MPNowPlayingInfoCenter.default().nowPlayingInfo = currentInfo
        }
      }
    }
  }

  var shouldPublishNowPlayingInfo: Bool {
    state == "playing" || state == "paused" || state == "loading" || state == "ready"
  }

  var isPlaybackActuallyRunning: Bool {
    engineConfigured && playerNodes.contains(where: \.isPlaying)
  }

  func shouldAutoplayPreparedTrack() -> Bool {
    state == "playing" && isPlaybackActuallyRunning
  }

  func reconcilePlaybackStateIfNeeded() {
    guard (state == "playing" || state == "loading"),
          !isPlaybackActuallyRunning else { return }
    state = currentFile == nil ? "none" : "paused"
    updateNowPlayingInfo()
  }

  func pauseForExternalInterruption() {
    guard state == "playing" || state == "loading" else { return }
    resumePositionSeconds = currentPositionSeconds()
    scheduleToken += 1
    stopAllPlayerNodes()
    state = currentFile == nil ? "none" : "paused"
    updateNowPlayingInfo()
    emitPlaybackState()
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
    equalizerNode.globalGain = effectiveGlobalGainDb()
  }

  func effectiveTotalGain() -> Double {
    let userBoost = pow(10, Double(audioBoostGainMb) / 2000)
    let trackDb = loudnessNormalizationEnabled
      ? currentIndex.flatMap { queue.indices.contains($0) ? queue[$0].loudnessGainDb : nil } ?? 0
      : 0
    return Double(volume) * userBoost * pow(10, trackDb / 20)
  }

  func effectivePlayerVolume() -> Float {
    Float(max(0, min(1, effectiveTotalGain())))
  }

  func effectiveGlobalGainDb() -> Float {
    let gain = effectiveTotalGain()
    guard gain > 1 else { return 0 }
    return Float(20 * log10(gain))
  }

  func applyEffectiveOutput() {
    guard engineConfigured else { return }
    playerNode.volume = effectivePlayerVolume()
    applyAudioBoost()
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
    stopAllPlayerNodes()
    state = "error"
    updateNowPlayingInfo()
    deactivateAudioSessionIfNeeded()
    emitPlaybackState()
    emitEvent(type: "playback-error", extra: ["message": error.localizedDescription])
  }

  func resetPlaybackState(keepQueue: Bool) {
    scheduleToken += 1
    stopAllPlayerNodes()
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
