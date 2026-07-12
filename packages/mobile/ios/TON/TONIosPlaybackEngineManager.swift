import AVFoundation
import Foundation
import MediaPlayer
import UIKit

@objc(TONIosPlaybackEngineManager)
final class TONIosPlaybackEngineManager: NSObject {
  private enum Capability: Int {
    case play = 0
    case pause = 3
    case stop = 4
    case seekTo = 5
    case skipToNext = 7
    case skipToPrevious = 8
  }

  private static let eqFrequencies: [Double] = [
    31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
  ]
  private static let defaultRemoteCapabilities: Set<Capability> = [
    .play,
    .pause,
    .skipToNext,
    .skipToPrevious,
  ]

  @objc
  static func sharedManager() -> TONIosPlaybackEngineManager {
    shared
  }

  private static let shared = TONIosPlaybackEngineManager()

  private lazy var engine = AVAudioEngine()
  private lazy var equalizerNode = AVAudioUnitEQ(numberOfBands: 10)
  private lazy var playerNode = AVAudioPlayerNode()
  private let stateQueue = DispatchQueue(label: "com.ton.player.ios-playback-engine")
  private lazy var timePitchNode = AVAudioUnitTimePitch()

  private var audioBoostGainMb = 0
  private var audioSessionActive = false
  private var audioSessionConfigured = false
  private var audioSessionObserversConfigured = false
  private var currentDurationSeconds = 0.0
  private var currentFile: AVAudioFile?
  private var currentIndex: Int?
  private var engineConfigured = false
  private var eqBandLevelsMb = Array(repeating: 0, count: 10)
  private var eqEnabled = false
  private var eventSink: (([String: Any]) -> Void)?
  private var pitchRatio: Float = 1
  private var queue: [TONIosPlaybackTrack] = []
  private var remoteCommandsConfigured = false
  private var remoteCapabilities = TONIosPlaybackEngineManager.defaultRemoteCapabilities
  private var repeatMode = 2
  private var resumePositionSeconds = 0.0
  private var scheduleToken = 0
  private var scheduledOffsetSeconds = 0.0
  private var shouldResumeAfterInterruption = false
  private var state = "none"
  private var volume: Float = 1

  private override init() {
    super.init()
  }

  func setEventSink(_ sink: (([String: Any]) -> Void)?) {
    stateQueue.async {
      self.eventSink = sink
    }
  }

  func initialize(completion: @escaping (Error?) -> Void) {
    stateQueue.async {
      self.configureAudioSessionObserversIfNeeded()
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
      completion(nil)
    }
  }

  func updateOptions(_ options: [String: Any], completion: @escaping () -> Void) {
    stateQueue.async {
      self.remoteCapabilities = self.parseRemoteCapabilities(from: options)
      if self.remoteCommandsConfigured {
        self.applyRemoteCommandCapabilities()
      }
      completion()
    }
  }

  func setQueue(_ tracks: [TONIosPlaybackTrack], completion: @escaping (Error?) -> Void) {
    stateQueue.async {
      do {
        self.queue = tracks

        guard !tracks.isEmpty else {
          self.resetPlaybackState(keepQueue: false)
          completion(nil)
          return
        }

        try self.prepareTrack(at: 0, autoplay: false)
        completion(nil)
      } catch {
        self.failPlayback(error)
        completion(error)
      }
    }
  }

  func addTracks(_ tracks: [TONIosPlaybackTrack], completion: @escaping () -> Void) {
    stateQueue.async {
      self.queue.append(contentsOf: tracks)
      completion()
    }
  }

  func loadTrack(_ track: TONIosPlaybackTrack, completion: @escaping (Error?) -> Void) {
    stateQueue.async {
      do {
        self.queue = [track]
        try self.prepareTrack(at: 0, autoplay: false)
        completion(nil)
      } catch {
        self.failPlayback(error)
        completion(error)
      }
    }
  }

  func play(completion: @escaping (Error?) -> Void) {
    stateQueue.async {
      do {
        try self.configureEngineIfNeeded()

        if self.currentIndex == nil, !self.queue.isEmpty {
          try self.prepareTrack(at: 0, autoplay: false)
        }

        guard self.currentIndex != nil, self.currentFile != nil else {
          completion(nil)
          return
        }

        try self.scheduleCurrentTrack(startingAt: self.resumePositionSeconds, playWhenReady: true)
        completion(nil)
      } catch {
        self.failPlayback(error)
        completion(error)
      }
    }
  }

  func pause(completion: @escaping () -> Void) {
    stateQueue.async {
      guard self.state == "playing" || self.state == "loading" else {
        completion()
        return
      }

      self.resumePositionSeconds = self.currentPositionSeconds()
      self.scheduleToken += 1
      self.playerNode.stop()
      self.state = self.currentFile == nil ? "none" : "paused"
      self.updateNowPlayingInfo()
      completion()
    }
  }

  func stop(completion: @escaping () -> Void) {
    stateQueue.async {
      self.resumePositionSeconds = 0
      self.scheduleToken += 1
      if self.engineConfigured {
        self.playerNode.stop()
      }
      self.state = self.currentFile == nil ? "none" : "stopped"
      self.updateNowPlayingInfo()
      self.deactivateAudioSessionIfNeeded()
      completion()
    }
  }

  func seek(to position: Double, completion: @escaping (Error?) -> Void) {
    stateQueue.async {
      let clamped = self.clampPosition(position)
      self.resumePositionSeconds = clamped

      guard self.currentIndex != nil, self.currentFile != nil else {
        self.updateNowPlayingInfo()
        completion(nil)
        return
      }

      if self.state == "playing" {
        do {
          try self.scheduleCurrentTrack(startingAt: clamped, playWhenReady: true)
          completion(nil)
        } catch {
          self.failPlayback(error)
          completion(error)
        }
        return
      }

      self.updateNowPlayingInfo()
      completion(nil)
    }
  }

  func setVolume(_ nextVolume: Float, completion: @escaping () -> Void) {
    stateQueue.async {
      self.volume = max(0, min(nextVolume, 1))
      if self.engineConfigured {
        self.playerNode.volume = self.volume
      }
      completion()
    }
  }

  func setRepeatMode(_ mode: Int, completion: @escaping () -> Void) {
    stateQueue.async {
      self.repeatMode = mode
      completion()
    }
  }

  func skip(to index: Int, completion: @escaping (Error?) -> Void) {
    stateQueue.async {
      do {
        try self.prepareTrack(at: index, autoplay: self.state == "playing")
        completion(nil)
      } catch {
        self.failPlayback(error)
        completion(error)
      }
    }
  }

  func skipToNext(completion: @escaping (Error?) -> Void) {
    stateQueue.async {
      do {
        guard let targetIndex = self.resolveNextIndex() else {
          completion(nil)
          return
        }

        try self.prepareTrack(at: targetIndex, autoplay: self.state == "playing")
        completion(nil)
      } catch {
        self.failPlayback(error)
        completion(error)
      }
    }
  }

  func skipToPrevious(completion: @escaping (Error?) -> Void) {
    stateQueue.async {
      do {
        guard let targetIndex = self.resolvePreviousIndex() else {
          completion(nil)
          return
        }

        try self.prepareTrack(at: targetIndex, autoplay: self.state == "playing")
        completion(nil)
      } catch {
        self.failPlayback(error)
        completion(error)
      }
    }
  }

  func removeUpcomingTracks(completion: @escaping () -> Void) {
    stateQueue.async {
      guard let currentIndex = self.currentIndex, currentIndex >= 0, currentIndex < self.queue.count else {
        completion()
        return
      }

      self.queue = Array(self.queue.prefix(currentIndex + 1))
      completion()
    }
  }

  func getPosition(completion: @escaping (Double) -> Void) {
    stateQueue.async {
      completion(self.currentPositionSeconds())
    }
  }

  func getProgress(completion: @escaping ([String: Any]) -> Void) {
    stateQueue.async {
      let position = self.currentPositionSeconds()
      let duration = self.currentDurationSeconds
      completion([
        "buffered": duration,
        "duration": duration,
        "position": position,
      ])
    }
  }

  func getPlaybackState(completion: @escaping ([String: Any]) -> Void) {
    stateQueue.async {
      completion(["state": self.state])
    }
  }

  func getActiveTrack(completion: @escaping ([String: Any]?) -> Void) {
    stateQueue.async {
      guard let currentIndex = self.currentIndex,
            currentIndex >= 0,
            currentIndex < self.queue.count else {
        completion(nil)
        return
      }

      completion(self.queue[currentIndex].asDictionary())
    }
  }

  func getActiveTrackIndex(completion: @escaping (NSNumber?) -> Void) {
    stateQueue.async {
      guard let currentIndex = self.currentIndex else {
        completion(nil)
        return
      }

      completion(NSNumber(value: currentIndex))
    }
  }

  func setPitch(_ ratio: Double, completion: @escaping () -> Void) {
    stateQueue.async {
      let clamped = max(0.25, min(ratio, 4))
      self.pitchRatio = Float(clamped)
      if self.engineConfigured {
        self.applyPitch()
      }
      completion()
    }
  }

  func getAudioSessionId(completion: @escaping (NSNumber) -> Void) {
    stateQueue.async {
      completion(NSNumber(value: self.engineConfigured ? 1 : 0))
    }
  }

  func attachEqualizer(sessionId: Int, completion: @escaping ([String: Any]) -> Void) {
    stateQueue.async {
      _ = sessionId
      self.applyEqualizerState()
      completion([
        "bandCount": Self.eqFrequencies.count,
        "frequencies": Self.eqFrequencies,
        "levelRange": [
          "max": 1200,
          "min": -1200,
        ],
      ])
    }
  }

  func setEqEnabled(_ enabled: Bool, completion: @escaping () -> Void) {
    stateQueue.async {
      self.eqEnabled = enabled
      self.applyEqualizerState()
      completion()
    }
  }

  func setEqBandLevel(index: Int, level: Int, completion: @escaping () -> Void) {
    stateQueue.async {
      guard index >= 0, index < self.eqBandLevelsMb.count else {
        completion()
        return
      }

      self.eqBandLevelsMb[index] = max(-1200, min(level, 1200))
      self.applyEqualizerState()
      completion()
    }
  }

  func getEqBandCount(completion: @escaping (NSNumber) -> Void) {
    stateQueue.async {
      completion(NSNumber(value: Self.eqFrequencies.count))
    }
  }

  func getEqBandFrequencies(completion: @escaping ([NSNumber]) -> Void) {
    stateQueue.async {
      completion(Self.eqFrequencies.map { NSNumber(value: $0) })
    }
  }

  func getEqBandLevelRange(completion: @escaping ([String: NSNumber]) -> Void) {
    stateQueue.async {
      completion([
        "max": NSNumber(value: 1200),
        "min": NSNumber(value: -1200),
      ])
    }
  }

  func attachAudioBoost(sessionId: Int, completion: @escaping () -> Void) {
    stateQueue.async {
      _ = sessionId
      self.applyAudioBoost()
      completion()
    }
  }

  func setAudioBoostTargetGain(_ gainMb: Int, completion: @escaping () -> Void) {
    stateQueue.async {
      self.audioBoostGainMb = max(0, gainMb)
      self.applyAudioBoost()
      completion()
    }
  }

  func releaseAudioBoost(completion: @escaping () -> Void) {
    stateQueue.async {
      self.audioBoostGainMb = 0
      self.applyAudioBoost()
      completion()
    }
  }

  private func configureAudioSessionIfNeeded() throws {
    guard !audioSessionConfigured else {
      return
    }

    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playback, mode: .default, options: [])
    audioSessionConfigured = true
  }

  private func activateAudioSessionIfNeeded() throws {
    try configureAudioSessionIfNeeded()
    guard !audioSessionActive else {
      return
    }

    try AVAudioSession.sharedInstance().setActive(true)
    audioSessionActive = true
  }

  private func deactivateAudioSessionIfNeeded() {
    guard audioSessionActive else {
      return
    }

    if engineConfigured && engine.isRunning {
      engine.pause()
    }

    do {
      try AVAudioSession.sharedInstance().setActive(
        false,
        options: .notifyOthersOnDeactivation
      )
      audioSessionActive = false
    } catch {
      if engineConfigured {
        engine.stop()
      }
      do {
        try AVAudioSession.sharedInstance().setActive(
          false,
          options: .notifyOthersOnDeactivation
        )
      } catch {
        // A later play call always activates the session again.
      }
      audioSessionActive = false
    }
  }

  private func configureEngineIfNeeded() throws {
    guard !engineConfigured else {
      return
    }

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

  private func startEngineIfNeeded() throws {
    if !engine.isRunning {
      try engine.start()
    }
  }

  private func configureRemoteCommandsIfNeeded() {
    if remoteCommandsConfigured {
      applyRemoteCommandCapabilities()
      return
    }

    remoteCommandsConfigured = true
    let commandCenter = MPRemoteCommandCenter.shared()

    commandCenter.playCommand.addTarget { [weak self] _ in
      self?.emitEvent(type: "remote-play")
      return .success
    }

    commandCenter.pauseCommand.addTarget { [weak self] _ in
      self?.emitEvent(type: "remote-pause")
      return .success
    }

    commandCenter.nextTrackCommand.addTarget { [weak self] _ in
      self?.emitEvent(type: "remote-next")
      return .success
    }

    commandCenter.previousTrackCommand.addTarget { [weak self] _ in
      self?.emitEvent(type: "remote-previous")
      return .success
    }

    commandCenter.stopCommand.addTarget { [weak self] _ in
      self?.emitEvent(type: "remote-stop")
      return .success
    }

    commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else {
        return .commandFailed
      }

      self?.emitEvent(type: "remote-seek", extra: [
        "position": event.positionTime,
      ])
      return .success
    }

    applyRemoteCommandCapabilities()
  }

  private func parseRemoteCapabilities(from options: [String: Any]) -> Set<Capability> {
    guard let rawCapabilities = options["capabilities"] as? [NSNumber] else {
      return remoteCapabilities
    }

    let parsedCapabilities = Set(rawCapabilities.compactMap {
      Capability(rawValue: $0.intValue)
    })

    if parsedCapabilities.isEmpty {
      return Self.defaultRemoteCapabilities
    }

    return parsedCapabilities
  }

  private func applyRemoteCommandCapabilities() {
    guard remoteCommandsConfigured else {
      return
    }

    let commandCenter = MPRemoteCommandCenter.shared()
    let isNowPlayingActive = shouldPublishNowPlayingInfo
    commandCenter.playCommand.isEnabled = isNowPlayingActive && remoteCapabilities.contains(.play)
    commandCenter.pauseCommand.isEnabled = isNowPlayingActive && remoteCapabilities.contains(.pause)
    commandCenter.nextTrackCommand.isEnabled = isNowPlayingActive && remoteCapabilities.contains(.skipToNext)
    commandCenter.previousTrackCommand.isEnabled = isNowPlayingActive && remoteCapabilities.contains(.skipToPrevious)
    commandCenter.changePlaybackPositionCommand.isEnabled = isNowPlayingActive && remoteCapabilities.contains(.seekTo)
    commandCenter.stopCommand.isEnabled = isNowPlayingActive && remoteCapabilities.contains(.stop)
  }

  private func configureAudioSessionObserversIfNeeded() {
    guard !audioSessionObserversConfigured else {
      return
    }

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
  private func handleAudioSessionInterruption(_ notification: Notification) {
    guard let typeValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          let interruptionType = AVAudioSession.InterruptionType(rawValue: typeValue) else {
      return
    }

    stateQueue.async {
      switch interruptionType {
      case .began:
        self.audioSessionActive = false
        guard self.state == "playing" else {
          self.shouldResumeAfterInterruption = false
          return
        }

        self.shouldResumeAfterInterruption = true
        self.emitEvent(type: "remote-duck", extra: [
          "paused": true,
          "permanent": false,
        ])
      case .ended:
        let optionsValue = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
        let shouldResume = self.shouldResumeAfterInterruption
          && AVAudioSession.InterruptionOptions(rawValue: optionsValue).contains(.shouldResume)
        self.shouldResumeAfterInterruption = false

        guard shouldResume else {
          return
        }

        do {
          try self.activateAudioSessionIfNeeded()
        } catch {
          return
        }

        self.emitEvent(type: "remote-duck", extra: [
          "paused": false,
          "permanent": false,
        ])
      @unknown default:
        self.shouldResumeAfterInterruption = false
      }
    }
  }

  @objc
  private func handleAudioRouteChange(_ notification: Notification) {
    guard let reasonValue = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue),
          reason == .oldDeviceUnavailable else {
      return
    }

    stateQueue.async {
      guard self.state == "playing" else {
        return
      }

      self.shouldResumeAfterInterruption = false
      self.emitEvent(type: "remote-duck", extra: [
        "paused": true,
        "permanent": false,
      ])
    }
  }

  private func prepareTrack(at index: Int, autoplay: Bool) throws {
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
    if engineConfigured {
      playerNode.stop()
    }
    state = autoplay ? "loading" : "ready"
    updateNowPlayingInfo()

    if autoplay {
      try scheduleCurrentTrack(startingAt: 0, playWhenReady: true)
    } else {
      deactivateAudioSessionIfNeeded()
    }
  }

  private func scheduleCurrentTrack(startingAt position: Double, playWhenReady: Bool) throws {
    guard let file = currentFile else {
      return
    }

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
        guard let self, token == self.scheduleToken else {
          return
        }

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

  private func handleTrackCompletion() {
    if repeatMode == 1, let currentIndex {
      do {
        try prepareTrack(at: currentIndex, autoplay: true)
      } catch {
        failPlayback(error)
      }
      return
    }

    if let nextIndex = resolveNextIndexForCompletion() {
      do {
        try prepareTrack(at: nextIndex, autoplay: true)
      } catch {
        failPlayback(error)
      }
      return
    }

    state = "ended"
    updateNowPlayingInfo()
    deactivateAudioSessionIfNeeded()
    emitEvent(type: "playback-queue-ended")
  }

  private func resolveNextIndex() -> Int? {
    guard !queue.isEmpty else {
      return nil
    }

    guard let currentIndex else {
      return 0
    }

    if currentIndex < queue.count - 1 {
      return currentIndex + 1
    }

    if repeatMode == 2 {
      return 0
    }

    return nil
  }

  private func resolvePreviousIndex() -> Int? {
    guard !queue.isEmpty else {
      return nil
    }

    guard let currentIndex else {
      return 0
    }

    if currentIndex > 0 {
      return currentIndex - 1
    }

    if repeatMode == 2 {
      return queue.count - 1
    }

    return 0
  }

  private func resolveNextIndexForCompletion() -> Int? {
    guard !queue.isEmpty else {
      return nil
    }

    guard let currentIndex else {
      return nil
    }

    if currentIndex < queue.count - 1 {
      return currentIndex + 1
    }

    if repeatMode == 2 {
      return 0
    }

    return nil
  }

  private func clampPosition(_ position: Double) -> Double {
    max(0, min(position, currentDurationSeconds))
  }

  private func currentPositionSeconds() -> Double {
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

  private func updateNowPlayingInfo() {
    applyRemoteCommandCapabilities()

    let nowPlayingCenter = MPNowPlayingInfoCenter.default()
    guard shouldPublishNowPlayingInfo,
          let currentIndex,
          currentIndex >= 0,
          currentIndex < queue.count else {
      nowPlayingCenter.nowPlayingInfo = nil
      return
    }

    let track = queue[currentIndex]
    var info: [String: Any] = [
      MPMediaItemPropertyTitle: track.title,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: currentPositionSeconds(),
      MPNowPlayingInfoPropertyPlaybackRate: state == "playing" ? 1 : 0,
    ]

    if let artist = track.artist, !artist.isEmpty {
      info[MPMediaItemPropertyArtist] = artist
    }

    if let album = track.album, !album.isEmpty {
      info[MPMediaItemPropertyAlbumTitle] = album
    }

    if currentDurationSeconds > 0 {
      info[MPMediaItemPropertyPlaybackDuration] = currentDurationSeconds
    }

    if let artworkURL = track.resolvedArtworkURL(),
       let image = UIImage(contentsOfFile: artworkURL.path) {
      info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(
        boundsSize: image.size,
        requestHandler: { _ in image }
      )
    }

    nowPlayingCenter.nowPlayingInfo = info
  }

  private var shouldPublishNowPlayingInfo: Bool {
    state == "playing" || state == "paused" || state == "loading"
  }

  private func applyPitch() {
    guard engineConfigured else {
      return
    }

    let cents = Float(1200 * log2(Double(max(0.25, min(pitchRatio, 4)))))
    timePitchNode.rate = 1
    timePitchNode.pitch = cents
  }

  private func applyEqualizerState() {
    guard engineConfigured else {
      return
    }

    for (index, band) in equalizerNode.bands.enumerated() {
      band.filterType = .parametric
      band.frequency = Float(Self.eqFrequencies[index])
      band.bandwidth = 1
      band.gain = eqEnabled ? Float(eqBandLevelsMb[index]) / 100 : 0
      band.bypass = !eqEnabled
    }
  }

  private func applyAudioBoost() {
    guard engineConfigured else {
      return
    }

    equalizerNode.globalGain = Float(audioBoostGainMb) / 100
  }

  private func emitEvent(type: String, extra: [String: Any] = [:]) {
    var payload = extra
    payload["type"] = type
    DispatchQueue.main.async {
      self.eventSink?(payload)
    }
  }

  private func failPlayback(_ error: Error) {
    scheduleToken += 1
    if engineConfigured {
      playerNode.stop()
    }
    state = "error"
    updateNowPlayingInfo()
    deactivateAudioSessionIfNeeded()
    emitEvent(type: "playback-error", extra: [
      "message": error.localizedDescription,
    ])
  }

  private func resetPlaybackState(keepQueue: Bool) {
    scheduleToken += 1
    if engineConfigured {
      playerNode.stop()
    }
    currentDurationSeconds = 0
    currentFile = nil
    currentIndex = nil
    resumePositionSeconds = 0
    scheduledOffsetSeconds = 0
    state = "none"
    if !keepQueue {
      queue = []
    }
    updateNowPlayingInfo()
    deactivateAudioSessionIfNeeded()
  }
}
