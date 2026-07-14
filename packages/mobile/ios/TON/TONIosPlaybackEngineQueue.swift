import Foundation

extension TONIosPlaybackEngineManager {
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
      if self.engineConfigured { self.playerNode.stop() }
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
      if self.engineConfigured { self.playerNode.volume = self.volume }
      completion()
    }
  }

  func setRepeatMode(_ mode: Int, completion: @escaping () -> Void) {
    stateQueue.async { self.repeatMode = mode; completion() }
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
        guard let targetIndex = self.resolveNextIndex() else { completion(nil); return }
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
        guard let targetIndex = self.resolvePreviousIndex() else { completion(nil); return }
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
      guard let currentIndex = self.currentIndex,
            currentIndex >= 0, currentIndex < self.queue.count else { completion(); return }
      self.queue = Array(self.queue.prefix(currentIndex + 1))
      completion()
    }
  }

  func getPosition(completion: @escaping (Double) -> Void) {
    stateQueue.async { completion(self.currentPositionSeconds()) }
  }

  func getProgress(completion: @escaping ([String: Any]) -> Void) {
    stateQueue.async {
      let position = self.currentPositionSeconds()
      let duration = self.currentDurationSeconds
      completion(["buffered": duration, "duration": duration, "position": position])
    }
  }

  func getPlaybackState(completion: @escaping ([String: Any]) -> Void) {
    stateQueue.async { completion(["state": self.state]) }
  }

  func getActiveTrack(completion: @escaping ([String: Any]?) -> Void) {
    stateQueue.async {
      guard let currentIndex = self.currentIndex,
            currentIndex >= 0, currentIndex < self.queue.count else { completion(nil); return }
      completion(self.queue[currentIndex].asDictionary())
    }
  }

  func getActiveTrackIndex(completion: @escaping (NSNumber?) -> Void) {
    stateQueue.async {
      guard let currentIndex = self.currentIndex else { completion(nil); return }
      completion(NSNumber(value: currentIndex))
    }
  }
}
