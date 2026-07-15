import AVFoundation
import Foundation

struct LoudnessIntegrator {
  enum ConsumeOutcome {
    case ok
    case cancelled
    case failed(String)
  }

  private let blockFrames = Int(TONIosLoudnessAnalyzerTask.blockDurationSeconds * TONIosLoudnessAnalyzerTask.outputSampleRate)
  private let stepFrames = Int(TONIosLoudnessAnalyzerTask.stepDurationSeconds * TONIosLoudnessAnalyzerTask.outputSampleRate)
  private let targetLufs: Double
  private let weights: [Double]
  private var blockEnergies: [Double] = []
  private var frameCursor = 0
  private var ring: [Double]
  private var ringCount = 0
  private var ringIndex = 0
  private var runningEnergySum = 0.0
  private var shelfFilters: [LoudnessBiquadFilter]
  private var highPassFilters: [LoudnessBiquadFilter]

  init(channelCount: Int, targetLufs: Double) {
    self.targetLufs = targetLufs
    self.weights = (0..<channelCount).map(Self.channelWeight)
    self.ring = Array(repeating: 0, count: blockFrames)
    self.shelfFilters = Array(repeating: LoudnessBiquadFilter.highShelf48k, count: channelCount)
    self.highPassFilters = Array(repeating: LoudnessBiquadFilter.highPass48k, count: channelCount)
  }

  mutating func consume(
    buffer: AVAudioPCMBuffer,
    isCancelled: () -> Bool,
  ) -> ConsumeOutcome {
    guard let channels = buffer.floatChannelData else {
      return .failed("Invalid PCM channel data.")
    }
    let frameLength = Int(buffer.frameLength)
    let channelCount = min(Int(buffer.format.channelCount), weights.count)
    for frame in 0..<frameLength {
      if frame % 2048 == 0, isCancelled() { return .cancelled }
      var weightedEnergy = 0.0
      for channel in 0..<channelCount {
        let sample = channels[channel][frame]
        let shelf = shelfFilters[channel].process(sample)
        let filtered = highPassFilters[channel].process(Float(shelf))
        weightedEnergy += weights[channel] * filtered * filtered
      }
      pushFrameEnergy(weightedEnergy)
    }
    return .ok
  }

  mutating func finish() -> TONIosLoudnessAnalyzerTask.Outcome {
    if blockEnergies.isEmpty, ringCount > 0 {
      blockEnergies.append(runningEnergySum / Double(ringCount))
    }
    let gatedByAbsolute = blockEnergies.filter {
      energyToLufs($0) >= TONIosLoudnessAnalyzerTask.absoluteGateLufs
    }
    if gatedByAbsolute.isEmpty { return .failed("No valid loudness blocks were measured.") }
    let ungatedMean = gatedByAbsolute.reduce(0, +) / Double(gatedByAbsolute.count)
    let relativeThreshold = energyToLufs(ungatedMean) - 10
    let finalEnergies = gatedByAbsolute.filter { energyToLufs($0) >= relativeThreshold }
    let effectiveEnergies = finalEnergies.isEmpty ? gatedByAbsolute : finalEnergies
    let meanEnergy = effectiveEnergies.reduce(0, +) / Double(effectiveEnergies.count)
    let lufs = energyToLufs(meanEnergy)
    return .completed(lufs: lufs, gain: max(-20.0, min(20.0, targetLufs - lufs)))
  }

  private mutating func pushFrameEnergy(_ energy: Double) {
    if ringCount < blockFrames {
      ring[ringCount] = energy
      ringCount += 1
      runningEnergySum += energy
    } else {
      runningEnergySum -= ring[ringIndex]
      ring[ringIndex] = energy
      runningEnergySum += energy
      ringIndex = (ringIndex + 1) % blockFrames
    }
    frameCursor += 1
    if ringCount == blockFrames {
      let offset = frameCursor - blockFrames
      if offset % stepFrames == 0 {
        blockEnergies.append(runningEnergySum / Double(blockFrames))
      }
    }
  }

  private func energyToLufs(_ value: Double) -> Double {
    -0.691 + (10.0 * log10(max(value, 1e-12)))
  }

  private static func channelWeight(for index: Int) -> Double {
    switch index {
    case 3: return 0.0
    case 4, 5: return 1.41
    default: return 1.0
    }
  }
}
