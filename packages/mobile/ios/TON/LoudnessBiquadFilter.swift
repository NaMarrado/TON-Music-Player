import Foundation

struct LoudnessBiquadFilter {
  static let highPass48k = LoudnessBiquadFilter(
    b0: 1.0, b1: -2.0, b2: 1.0,
    a1: -1.990_047_454_833_98, a2: 0.990_072_250_366_21,
  )
  static let highShelf48k = LoudnessBiquadFilter(
    b0: 1.535_124_859_586_97,
    b1: -2.691_696_189_406_38,
    b2: 1.198_392_810_852_85,
    a1: -1.690_659_293_182_41,
    a2: 0.732_480_774_215_85,
  )

  let a1: Double
  let a2: Double
  let b0: Double
  let b1: Double
  let b2: Double
  private var z1 = 0.0
  private var z2 = 0.0

  mutating func process(_ sample: Float) -> Double {
    let x = Double(sample)
    let y = b0 * x + z1
    z1 = b1 * x - a1 * y + z2
    z2 = b2 * x - a2 * y
    return y
  }
}
