import AVFoundation
import Foundation

extension TONIosPlaybackEngineManager {
  func prepareTrack(at index: Int, autoplay: Bool) throws {
    guard index >= 0, index < queue.count else {
      throw NSError(
        domain: "TONIosPlaybackEngine",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Track index is out of bounds."],
      )
    }
    guard let fileURL = queue[index].resolvedFileURL() else {
      throw NSError(
        domain: "TONIosPlaybackEngine",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Invalid local track path."],
      )
    }
    let audioFile = try AVAudioFile(forReading: fileURL)
    currentFile = audioFile
    currentIndex = index
    currentDurationSeconds = queue[index].duration
      ?? Double(audioFile.length) / audioFile.processingFormat.sampleRate
    resumePositionSeconds = 0
    scheduledOffsetSeconds = 0
    scheduleToken += 1
    if engineConfigured { playerNode.stop() }
    state = autoplay ? "loading" : "ready"
    updateNowPlayingInfo()
    if autoplay {
      try scheduleCurrentTrack(startingAt: 0, playWhenReady: true)
    } else {
      deactivateAudioSessionIfNeeded()
    }
  }

  func scheduleCurrentTrack(startingAt position: Double, playWhenReady: Bool) throws {
    guard let file = currentFile else { return }
    try configureEngineIfNeeded()
    try activateAudioSessionIfNeeded()
    try startEngineIfNeeded()
    let clamped = clampPosition(position)
    let sampleRate = file.processingFormat.sampleRate
    let startFrame = AVAudioFramePosition(clamped * sampleRate)
    let availableFrames = max(0, file.length - startFrame)
    if availableFrames <= 0 {
      resumePositionSeconds = currentDurationSeconds
      handleTrackCompletion()
      return
    }
    playerNode.stop()
    scheduleToken += 1
    let token = scheduleToken
    scheduledOffsetSeconds = clamped
    resumePositionSeconds = clamped
    playerNode.scheduleSegment(
      file,
      startingFrame: startFrame,
      frameCount: AVAudioFrameCount(availableFrames),
      at: nil,
      completionCallbackType: .dataPlayedBack,
    ) { [weak self] _ in
      self?.stateQueue.async {
        guard let self, token == self.scheduleToken else { return }
        self.resumePositionSeconds = self.currentDurationSeconds
        self.handleTrackCompletion()
      }
    }
    if playWhenReady {
      playerNode.play()
      state = "playing"
      configureRemoteCommandsIfNeeded()
    } else if state == "playing" {
      state = "ready"
    }
    updateNowPlayingInfo()
  }

  func handleTrackCompletion() {
    if repeatMode == 1, let currentIndex {
      do { try prepareTrack(at: currentIndex, autoplay: true) } catch { failPlayback(error) }
      return
    }
    if let nextIndex = resolveNextIndexForCompletion() {
      do { try prepareTrack(at: nextIndex, autoplay: true) } catch { failPlayback(error) }
      return
    }
    state = "ended"
    updateNowPlayingInfo()
    deactivateAudioSessionIfNeeded()
    emitEvent(type: "playback-queue-ended")
  }

  func resolveNextIndex() -> Int? {
    guard !queue.isEmpty else { return nil }
    guard let currentIndex else { return 0 }
    if currentIndex < queue.count - 1 { return currentIndex + 1 }
    return repeatMode == 2 ? 0 : nil
  }

  func resolvePreviousIndex() -> Int? {
    guard !queue.isEmpty else { return nil }
    guard let currentIndex else { return 0 }
    if currentIndex > 0 { return currentIndex - 1 }
    return repeatMode == 2 ? queue.count - 1 : 0
  }

  func resolveNextIndexForCompletion() -> Int? {
    guard !queue.isEmpty, let currentIndex else { return nil }
    if currentIndex < queue.count - 1 { return currentIndex + 1 }
    return repeatMode == 2 ? 0 : nil
  }

  func clampPosition(_ position: Double) -> Double {
    max(0, min(position, currentDurationSeconds))
  }

  func currentPositionSeconds() -> Double {
    guard engineConfigured,
          state == "playing",
          playerNode.isPlaying,
          let renderTime = playerNode.lastRenderTime,
          let playerTime = playerNode.playerTime(forNodeTime: renderTime) else {
      return clampPosition(resumePositionSeconds)
    }
    let elapsed = Double(playerTime.sampleTime) / playerTime.sampleRate
    return clampPosition(scheduledOffsetSeconds + elapsed)
  }
}
