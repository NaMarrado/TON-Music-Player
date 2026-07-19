import Foundation

struct TONIosPlaybackTrack {
  let album: String?
  let artist: String?
  let artwork: String?
  let duration: Double?
  let id: String
  let loudnessGainDb: Double
  let title: String
  let url: String

  init?(dictionary: [String: Any]) {
    guard let rawId = dictionary["id"] else {
      return nil
    }

    guard let url = dictionary["url"] as? String, !url.isEmpty else {
      return nil
    }

    self.id = String(describing: rawId)
    self.url = url
    self.title = (dictionary["title"] as? String) ?? ""
    self.artist = dictionary["artist"] as? String
    self.album = dictionary["album"] as? String
    self.artwork = dictionary["artwork"] as? String
    self.duration = dictionary["duration"] as? Double
    self.loudnessGainDb = (dictionary["loudnessGainDb"] as? NSNumber)?.doubleValue ?? 0
  }

  func asDictionary() -> [String: Any] {
    var dictionary: [String: Any] = [
      "id": id,
      "title": title,
      "url": url,
      "loudnessGainDb": loudnessGainDb,
    ]

    if let artist {
      dictionary["artist"] = artist
    }

    if let album {
      dictionary["album"] = album
    }

    if let artwork {
      dictionary["artwork"] = artwork
    }

    if let duration {
      dictionary["duration"] = duration
    }

    return dictionary
  }

  func resolvedFileURL() -> URL? {
    if url.hasPrefix("file://"), let resolved = URL(string: url) {
      return resolved
    }

    return URL(fileURLWithPath: url)
  }

  func resolvedArtworkURL() -> URL? {
    guard let artwork, !artwork.isEmpty else {
      return nil
    }

    if artwork.hasPrefix("file://"), let resolved = URL(string: artwork) {
      return resolved
    }

    return URL(fileURLWithPath: artwork)
  }
}
