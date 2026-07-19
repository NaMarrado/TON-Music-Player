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
    // Invalidate pending ramps and silence the previous track before applying
    // the next track's loudness gain to the shared audio graph.
    scheduleToken += 1
    if engineConfigured {
      playerNode.volume = 0
      playerNode.stop()
    }
    currentFile = audioFile
    currentIndex = index
    applyAudioBoost()
    currentDurationSeconds = queue[index].duration
      ?? Double(audioFile.length) / audioFile.processingFormat.sampleRate
    resumePositionSeconds = 0
    scheduledOffsetSeconds = 0
    state = autoplay ? "loading" : "ready"
    if autoplay {
      // The previous node is already stopped. Schedule the new audio before
      // artwork or bridge work so a track switch cannot introduce silence.
      try scheduleCurrentTrack(
        startingAt: 0,
        playWhenReady: true,
        playerNodeIsStopped: true
      )
    } else {
      updateNowPlayingInfo()
      emitPlaybackSnapshot()
      deactivateAudioSessionIfNeeded()
    }
  }

  func scheduleCurrentTrack(
    startingAt position: Double,
    playWhenReady: Bool,
    playerNodeIsStopped: Bool = false
  ) throws {
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
    if !playerNodeIsStopped {
      playerNode.stop()
      scheduleToken += 1
    }
    playerNode.volume = 0
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
      rampPlayerVolume(for: token)
    } else if state == "playing" {
      state = "ready"
      playerNode.volume = effectivePlayerVolume()
    }
    updateNowPlayingInfo()
    emitPlaybackSnapshot()
  }

  func rampPlayerVolume(for token: Int) {
    let steps = 4
    for step in 1...steps {
      stateQueue.asyncAfter(deadline: .now() + (0.006 * Double(step))) {
        guard token == self.scheduleToken, self.playerNode.isPlaying else { return }
        self.playerNode.volume = self.effectivePlayerVolume() * Float(step) / Float(steps)
      }
    }
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
    emitPlaybackState()
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
