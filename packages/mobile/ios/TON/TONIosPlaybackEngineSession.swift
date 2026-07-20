import AVFoundation
import Foundation
import MediaPlayer

extension TONIosPlaybackEngineManager {
  func configureAudioSessionIfNeeded() throws {
    guard !audioSessionConfigured else { return }
    try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
    audioSessionConfigured = true
  }

  func activateAudioSessionIfNeeded() throws {
    try configureAudioSessionIfNeeded()
    guard !audioSessionActive else { return }
    try AVAudioSession.sharedInstance().setActive(true)
    audioSessionActive = true
  }

  func deactivateAudioSessionIfNeeded() {
    guard audioSessionActive else { return }
    if engineConfigured && engine.isRunning { engine.pause() }
    do {
      try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      audioSessionActive = false
    } catch {
      if engineConfigured { engine.stop() }
      do {
        try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      } catch {
        // A later play call always activates the session again.
      }
      audioSessionActive = false
    }
  }

  func configureEngineIfNeeded() throws {
    guard !engineConfigured else { return }
    for playerNode in playerNodes { engine.attach(playerNode) }
    engine.attach(sourceMixerNode)
    engine.attach(timePitchNode)
    engine.attach(equalizerNode)
    engine.connect(playerNodes[0], to: sourceMixerNode, fromBus: 0, toBus: 0, format: nil)
    engine.connect(playerNodes[1], to: sourceMixerNode, fromBus: 0, toBus: 1, format: nil)
    engine.connect(sourceMixerNode, to: timePitchNode, format: nil)
    engine.connect(timePitchNode, to: equalizerNode, format: nil)
    engine.connect(equalizerNode, to: engine.mainMixerNode, format: nil)
    engineConfigured = true
    for playerNode in playerNodes { playerNode.volume = 0 }
    playerNode.volume = effectivePlayerVolume()
    timePitchNode.rate = 1
    applyPitch()
    applyEqualizerState()
    applyAudioBoost()
    engine.prepare()
  }

  func stopAllPlayerNodes() {
    guard engineConfigured else { return }
    for playerNode in playerNodes {
      playerNode.volume = 0
      playerNode.stop()
    }
  }

  func startEngineIfNeeded() throws {
    if !engine.isRunning { try engine.start() }
  }

  func configureRemoteCommandsIfNeeded() {
    if remoteCommandsConfigured { applyRemoteCommandCapabilities(); return }
    remoteCommandsConfigured = true
    let commandCenter = MPRemoteCommandCenter.shared()
    commandCenter.playCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      self.play { _ in }
      return .success
    }
    commandCenter.pauseCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      self.pause {}
      return .success
    }
    commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      self.togglePlayPauseFromRemote()
      return .success
    }
    commandCenter.nextTrackCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      self.skipToNextFromRemote()
      return .success
    }
    commandCenter.previousTrackCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      self.skipToPreviousFromRemote()
      return .success
    }
    commandCenter.changeShuffleModeCommand.addTarget { [weak self] event in
      guard let event = event as? MPChangeShuffleModeCommandEvent else {
        return .commandFailed
      }
      let enabled = event.shuffleType != .off
      self?.setShuffleFromRemote(enabled)
      return .success
    }
    commandCenter.changeRepeatModeCommand.addTarget { [weak self] event in
      guard let event = event as? MPChangeRepeatModeCommandEvent else {
        return .commandFailed
      }
      let mode = event.repeatType == .one ? 1 : 2
      self?.setRepeatFromRemote(mode)
      return .success
    }
    commandCenter.stopCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      self.stop {}
      return .success
    }
    commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else {
        return .commandFailed
      }
      self?.seek(to: event.positionTime) { _ in }
      return .success
    }
    applyRemoteCommandCapabilities()
  }

  func parseRemoteCapabilities(from options: [String: Any]) -> Set<Capability> {
    guard let rawCapabilities = options["capabilities"] as? [NSNumber] else {
      return remoteCapabilities
    }
    let parsed = Set(rawCapabilities.compactMap { Capability(rawValue: $0.intValue) })
    return parsed.isEmpty ? Self.defaultRemoteCapabilities : parsed
  }

  func applyRemoteCommandCapabilities() {
    guard remoteCommandsConfigured else { return }
    let commands = MPRemoteCommandCenter.shared()
    let active = shouldPublishNowPlayingInfo
    commands.playCommand.isEnabled = active && remoteCapabilities.contains(.play)
    commands.pauseCommand.isEnabled = active && remoteCapabilities.contains(.pause)
    commands.togglePlayPauseCommand.isEnabled = active
    commands.nextTrackCommand.isEnabled = active && remoteCapabilities.contains(.skipToNext)
    commands.previousTrackCommand.isEnabled = active && remoteCapabilities.contains(.skipToPrevious)
    commands.changeShuffleModeCommand.isEnabled = active
    commands.changeShuffleModeCommand.currentShuffleType = shuffleEnabled ? .items : .off
    commands.changeRepeatModeCommand.isEnabled = active
    commands.changeRepeatModeCommand.currentRepeatType = repeatMode == 1 ? .one : .all
    commands.changePlaybackPositionCommand.isEnabled = active && remoteCapabilities.contains(.seekTo)
    commands.stopCommand.isEnabled = active && remoteCapabilities.contains(.stop)
  }

  private func togglePlayPauseFromRemote() {
    stateQueue.async {
      if self.state == "playing" || self.state == "loading" {
        self.pause {}
      } else {
        self.play { _ in }
      }
    }
  }

  private func skipToNextFromRemote() {
    stateQueue.async {
      guard let targetIndex = self.resolveNextIndex() else {
        // JS owns the full source queue and materializes the next rolling window.
        self.emitEvent(type: "remote-next")
        return
      }
      do {
        try self.prepareTrack(at: targetIndex, autoplay: self.state == "playing")
      } catch {
        self.failPlayback(error)
      }
    }
  }

  private func skipToPreviousFromRemote() {
    stateQueue.async {
      guard let currentIndex = self.currentIndex, currentIndex > 0 else {
        // The previous source item is outside the native rolling window.
        self.emitEvent(type: "remote-previous")
        return
      }
      do {
        try self.prepareTrack(at: currentIndex - 1, autoplay: self.state == "playing")
      } catch {
        self.failPlayback(error)
      }
    }
  }

  private func setShuffleFromRemote(_ enabled: Bool) {
    stateQueue.async {
      self.shuffleEnabled = enabled
      self.updateNowPlayingInfo()
      self.emitEvent(type: "remote-shuffle", extra: ["enabled": enabled])
    }
  }

  private func setRepeatFromRemote(_ mode: Int) {
    stateQueue.async {
      self.repeatMode = mode
      self.updateNowPlayingInfo()
      self.emitEvent(
        type: "remote-repeat",
        extra: ["mode": mode == 1 ? "one" : "all"]
      )
    }
  }

  func configureAudioSessionObserversIfNeeded() {
    guard !audioSessionObserversConfigured else { return }
    audioSessionObserversConfigured = true
    let center = NotificationCenter.default
    center.addObserver(
      self,
      selector: #selector(handleAudioSessionInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleAudioRouteChange(_:)),
      name: AVAudioSession.routeChangeNotification,
      object: nil
    )
  }

  @objc
  func handleAudioSessionInterruption(_ notification: Notification) {
    guard let typeValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          let interruptionType = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }
    stateQueue.async {
      switch interruptionType {
      case .began:
        self.audioSessionActive = false
        guard self.state == "playing" else {
          self.shouldResumeAfterInterruption = false
          return
        }
        self.shouldResumeAfterInterruption = true
        self.emitEvent(type: "remote-duck", extra: ["paused": true, "permanent": false])
      case .ended:
        let value = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
        let shouldResume = self.shouldResumeAfterInterruption
          && AVAudioSession.InterruptionOptions(rawValue: value).contains(.shouldResume)
        self.shouldResumeAfterInterruption = false
        guard shouldResume else { return }
        do { try self.activateAudioSessionIfNeeded() } catch { return }
        self.emitEvent(type: "remote-duck", extra: ["paused": false, "permanent": false])
      @unknown default:
        self.shouldResumeAfterInterruption = false
      }
    }
  }

  @objc
  func handleAudioRouteChange(_ notification: Notification) {
    guard let value = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: value),
          reason == .oldDeviceUnavailable else { return }
    stateQueue.async {
      guard self.state == "playing" else { return }
      self.shouldResumeAfterInterruption = false
      self.emitEvent(type: "remote-duck", extra: ["paused": true, "permanent": false])
    }
  }
}
