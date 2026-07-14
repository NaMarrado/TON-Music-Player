import AVFoundation
import Foundation
import MediaPlayer

@objc(TONIosPlaybackEngineManager)
final class TONIosPlaybackEngineManager: NSObject {
  enum Capability: Int {
    case play = 0
    case pause = 3
    case stop = 4
    case seekTo = 5
    case skipToNext = 7
    case skipToPrevious = 8
  }

  static let eqFrequencies: [Double] = [
    31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
  ]
  static let defaultRemoteCapabilities: Set<Capability> = [
    .play, .pause, .skipToNext, .skipToPrevious,
  ]

  @objc
  static func sharedManager() -> TONIosPlaybackEngineManager { shared }
  private static let shared = TONIosPlaybackEngineManager()

  lazy var engine = AVAudioEngine()
  lazy var equalizerNode = AVAudioUnitEQ(numberOfBands: 10)
  lazy var playerNode = AVAudioPlayerNode()
  let stateQueue = DispatchQueue(label: "com.ton.player.ios-playback-engine")
  lazy var timePitchNode = AVAudioUnitTimePitch()
  var audioBoostGainMb = 0
  var audioSessionActive = false
  var audioSessionConfigured = false
  var audioSessionObserversConfigured = false
  var currentDurationSeconds = 0.0
  var currentFile: AVAudioFile?
  var currentIndex: Int?
  var engineConfigured = false
  var eqBandLevelsMb = Array(repeating: 0, count: 10)
  var eqEnabled = false
  var eventSink: (([String: Any]) -> Void)?
  var pitchRatio: Float = 1
  var queue: [TONIosPlaybackTrack] = []
  var remoteCommandsConfigured = false
  var remoteCapabilities = TONIosPlaybackEngineManager.defaultRemoteCapabilities
  var repeatMode = 2
  var resumePositionSeconds = 0.0
  var scheduleToken = 0
  var scheduledOffsetSeconds = 0.0
  var shouldResumeAfterInterruption = false
  var state = "none"
  var volume: Float = 1

  private override init() { super.init() }

  func setEventSink(_ sink: (([String: Any]) -> Void)?) {
    stateQueue.async { self.eventSink = sink }
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
      if self.remoteCommandsConfigured { self.applyRemoteCommandCapabilities() }
      completion()
    }
  }
}
