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
    engine.attach(playerNode)
    engine.attach(timePitchNode)
    engine.attach(equalizerNode)
    engine.connect(playerNode, to: timePitchNode, format: nil)
    engine.connect(timePitchNode, to: equalizerNode, format: nil)
    engine.connect(equalizerNode, to: engine.mainMixerNode, format: nil)
    engineConfigured = true
    playerNode.volume = volume
    timePitchNode.rate = 1
    applyPitch()
    applyEqualizerState()
    applyAudioBoost()
    engine.prepare()
  }

  func startEngineIfNeeded() throws {
    if !engine.isRunning { try engine.start() }
  }

  func configureRemoteCommandsIfNeeded() {
    if remoteCommandsConfigured { applyRemoteCommandCapabilities(); return }
    remoteCommandsConfigured = true
    let commandCenter = MPRemoteCommandCenter.shared()
    commandCenter.playCommand.addTarget { [weak self] _ in
      self?.emitEvent(type: "remote-play"); return .success
    }
    commandCenter.pauseCommand.addTarget { [weak self] _ in
      self?.emitEvent(type: "remote-pause"); return .success
    }
    commandCenter.nextTrackCommand.addTarget { [weak self] _ in
      self?.emitEvent(type: "remote-next"); return .success
    }
    commandCenter.previousTrackCommand.addTarget { [weak self] _ in
      self?.emitEvent(type: "remote-previous"); return .success
    }
    commandCenter.stopCommand.addTarget { [weak self] _ in
      self?.emitEvent(type: "remote-stop"); return .success
    }
    commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else {
        return .commandFailed
      }
      self?.emitEvent(type: "remote-seek", extra: ["position": event.positionTime])
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
    commands.nextTrackCommand.isEnabled = active && remoteCapabilities.contains(.skipToNext)
    commands.previousTrackCommand.isEnabled = active && remoteCapabilities.contains(.skipToPrevious)
    commands.changePlaybackPositionCommand.isEnabled = active && remoteCapabilities.contains(.seekTo)
    commands.stopCommand.isEnabled = active && remoteCapabilities.contains(.stop)
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
