import ActivityKit
import Foundation
import UIKit
import UserNotifications

struct TONIosDownloadActivityState {
  let activeNotificationBody: String
  let activeNotificationTitle: String
  let artist: String
  let itemId: Int
  let progress: Double
  let state: String
  let title: String

  init(record: TONIosBackgroundDownloadRecord) {
    activeNotificationBody = record.activeNotificationBody
    activeNotificationTitle = record.activeNotificationTitle
    artist = record.artist
    itemId = record.itemId
    progress = record.progress
    state = record.state
    title = record.title
  }

  init(request: TONIosDownloadActivityRequest) {
    activeNotificationBody = request.activeNotificationBody
    activeNotificationTitle = request.activeNotificationTitle
    artist = request.artist
    itemId = request.itemId
    progress = 0
    state = "running"
    title = request.title
  }
}

final class TONIosDownloadActivityManager: @unchecked Sendable {
  static let shared = TONIosDownloadActivityManager()

  private let notificationCenter = UNUserNotificationCenter.current()
  private let stateQueue = DispatchQueue(label: "com.ton.player.ios-download-activity")
  private var isRunningByItemId: [Int: Bool] = [:]
  private var primedItemIds = Set<Int>()
  private var revisionByItemId: [Int: Int] = [:]
  private var staticNotificationItemIds = Set<Int>()

  private init() {}

  func synchronize(_ record: TONIosBackgroundDownloadRecord) {
    stateQueue.async {
      self.primedItemIds.remove(record.itemId)
      self.synchronizeOnStateQueue(TONIosDownloadActivityState(record: record))
    }
  }

  func begin(_ request: TONIosDownloadActivityRequest) {
    stateQueue.async {
      self.primedItemIds.insert(request.itemId)
      self.synchronizeOnStateQueue(TONIosDownloadActivityState(request: request))
    }
  }

  func end(itemId: Int) {
    stateQueue.async {
      self.primedItemIds.remove(itemId)
      self.endOnStateQueue(itemId: itemId)
    }
  }

  func reconcile(_ records: [TONIosBackgroundDownloadRecord]) {
    stateQueue.async {
      let runningRecords = records.filter { $0.state == "running" }
      let runningItemIds = Set(runningRecords.map(\.itemId)).union(self.primedItemIds)

      if #available(iOS 16.1, *) {
        Task {
          await TONDownloadActivityRuntime.controller.endActivities(except: runningItemIds)
        }
      }

      for itemId in self.staticNotificationItemIds where !runningItemIds.contains(itemId) {
        self.dismissStaticNotification(itemId: itemId)
      }

      for record in records {
        self.primedItemIds.remove(record.itemId)
        self.synchronizeOnStateQueue(TONIosDownloadActivityState(record: record))
      }
    }
  }

  private func synchronizeOnStateQueue(_ state: TONIosDownloadActivityState) {
    let revision = (revisionByItemId[state.itemId] ?? 0) + 1
    revisionByItemId[state.itemId] = revision
    isRunningByItemId[state.itemId] = state.state == "running"

    guard state.state == "running" else {
      endOnStateQueue(itemId: state.itemId, incrementRevision: false)
      return
    }

    if #available(iOS 16.1, *) {
      Task {
        let usesLiveActivity = await TONDownloadActivityRuntime.controller.upsert(state)
        self.stateQueue.async {
          guard self.revisionByItemId[state.itemId] == revision else {
            if usesLiveActivity, self.isRunningByItemId[state.itemId] != true {
              Task {
                await TONDownloadActivityRuntime.controller.end(itemId: state.itemId)
              }
            }
            return
          }

          if usesLiveActivity {
            self.dismissStaticNotification(itemId: state.itemId)
          } else {
            self.scheduleStaticNotification(state)
          }
        }
      }
      return
    }

    scheduleStaticNotification(state)
  }

  private func endOnStateQueue(itemId: Int, incrementRevision: Bool = true) {
    if incrementRevision {
      revisionByItemId[itemId] = (revisionByItemId[itemId] ?? 0) + 1
    }
    isRunningByItemId[itemId] = false
    dismissStaticNotification(itemId: itemId)
    if #available(iOS 16.1, *) {
      Task {
        await TONDownloadActivityRuntime.controller.end(itemId: itemId)
      }
    }
  }

  private func staticNotificationIdentifier(itemId: Int) -> String {
    "ton.download.active.\(itemId)"
  }

  private func scheduleStaticNotification(_ state: TONIosDownloadActivityState) {
    guard staticNotificationItemIds.insert(state.itemId).inserted else {
      return
    }

    let identifier = staticNotificationIdentifier(itemId: state.itemId)
    notificationCenter.getDeliveredNotifications { delivered in
      guard !delivered.contains(where: { $0.request.identifier == identifier }) else {
        return
      }

      self.notificationCenter.getPendingNotificationRequests { pending in
        guard !pending.contains(where: { $0.identifier == identifier }) else {
          return
        }

        self.stateQueue.async {
          guard
            self.staticNotificationItemIds.contains(state.itemId),
            self.isRunningByItemId[state.itemId] == true
          else {
            return
          }

          let content = UNMutableNotificationContent()
          content.title = state.activeNotificationTitle
          content.body = state.activeNotificationBody
          content.sound = nil
          content.userInfo = [
            "downloadId": state.itemId,
            "kind": "active",
            "url": "ton://downloads",
          ]

          self.notificationCenter.add(
            UNNotificationRequest(identifier: identifier, content: content, trigger: nil)
          )
        }
      }
    }
  }

  private func dismissStaticNotification(itemId: Int) {
    staticNotificationItemIds.remove(itemId)
    let identifier = staticNotificationIdentifier(itemId: itemId)
    notificationCenter.removePendingNotificationRequests(withIdentifiers: [identifier])
    notificationCenter.removeDeliveredNotifications(withIdentifiers: [identifier])
  }
}
