import CommonCrypto
import Foundation
import React

/// Hashes files off the JS thread; hashing a song in JavaScript froze the app during sync and downloads.
@objc(IosFileHash)
final class IosFileHash: NSObject {
  private static let chunkSize = 1 << 20
  private let queue = DispatchQueue(label: "cz.ton.player.file-hash", qos: .utility, attributes: .concurrent)

  @objc static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(hashFileSha256:resolver:rejecter:)
  func hashFileSha256(
    _ path: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    queue.async {
      guard let handle = try? FileHandle(forReadingFrom: Self.localFileURL(from: path)) else {
        reject("file_hash_open_failed", "Cannot hash missing file: \(path)", nil)
        return
      }
      defer { try? handle.close() }

      var context = CC_SHA256_CTX()
      CC_SHA256_Init(&context)
      while true {
        let chunk = autoreleasepool { handle.readData(ofLength: Self.chunkSize) }
        if chunk.isEmpty { break }
        chunk.withUnsafeBytes { bytes in
          _ = CC_SHA256_Update(&context, bytes.baseAddress, CC_LONG(chunk.count))
        }
      }
      var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
      CC_SHA256_Final(&digest, &context)
      resolve(digest.map { String(format: "%02x", $0) }.joined())
    }
  }

  private static func localFileURL(from value: String) -> URL {
    guard value.hasPrefix("file://") else {
      return URL(fileURLWithPath: value)
    }
    let encodedPath = String(value.dropFirst("file://".count))
    let decodedPath = encodedPath.removingPercentEncoding ?? encodedPath
    if FileManager.default.fileExists(atPath: decodedPath) {
      return URL(fileURLWithPath: decodedPath)
    }
    return URL(fileURLWithPath: encodedPath)
  }
}
