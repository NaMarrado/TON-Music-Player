import Foundation

extension TONIosPlaybackEngineManager {
  func setPitch(_ ratio: Double, completion: @escaping () -> Void) {
    stateQueue.async {
      self.pitchRatio = Float(max(0.25, min(ratio, 4)))
      if self.engineConfigured { self.applyPitch() }
      completion()
    }
  }

  func getAudioSessionId(completion: @escaping (NSNumber) -> Void) {
    stateQueue.async { completion(NSNumber(value: self.engineConfigured ? 1 : 0)) }
  }

  func attachEqualizer(sessionId: Int, completion: @escaping ([String: Any]) -> Void) {
    stateQueue.async {
      _ = sessionId
      self.applyEqualizerState()
      completion([
        "bandCount": Self.eqFrequencies.count,
        "frequencies": Self.eqFrequencies,
        "levelRange": ["max": 1200, "min": -1200],
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
      guard index >= 0, index < self.eqBandLevelsMb.count else { completion(); return }
      self.eqBandLevelsMb[index] = max(-1200, min(level, 1200))
      self.applyEqualizerState()
      completion()
    }
  }

  func getEqBandCount(completion: @escaping (NSNumber) -> Void) {
    stateQueue.async { completion(NSNumber(value: Self.eqFrequencies.count)) }
  }
  func getEqBandFrequencies(completion: @escaping ([NSNumber]) -> Void) {
    stateQueue.async { completion(Self.eqFrequencies.map { NSNumber(value: $0) }) }
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
    stateQueue.async { _ = sessionId; self.applyEffectiveOutput(); completion() }
  }
  func setAudioBoostTargetGain(_ gainMb: Int, completion: @escaping () -> Void) {
    stateQueue.async {
      self.audioBoostGainMb = max(0, gainMb)
      self.applyEffectiveOutput()
      completion()
    }
  }
  func setLoudnessNormalizationEnabled(_ enabled: Bool, completion: @escaping () -> Void) {
    stateQueue.async {
      self.loudnessNormalizationEnabled = enabled
      self.applyEffectiveOutput()
      completion()
    }
  }
  func releaseAudioBoost(completion: @escaping () -> Void) {
    stateQueue.async {
      self.audioBoostGainMb = 0
      self.applyEffectiveOutput()
      completion()
    }
  }
}
