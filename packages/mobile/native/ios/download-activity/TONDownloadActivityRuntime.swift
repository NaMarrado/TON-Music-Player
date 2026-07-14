import ActivityKit
import Foundation
import UIKit

@available(iOS 16.1, *)
enum TONDownloadActivityRuntime {
  static let controller = TONDownloadActivityController()
}

@available(iOS 16.1, *)
actor TONDownloadActivityController {
  private var activityByItemId: [Int: Activity<TONDownloadActivityAttributes>] = [:]
  private var lastStateByItemId: [Int: TONDownloadActivityAttributes.ContentState] = [:]

  func upsert(_ state: TONIosDownloadActivityState) async -> Bool {
    let contentState = makeContentState(state)
    if let activity = await recoverActivity(itemId: state.itemId, contentState: contentState) {
      if lastStateByItemId[state.itemId] != contentState {
        lastStateByItemId[state.itemId] = contentState
        await update(activity, contentState: contentState)
      }
      return true
    }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
    let canStart = await MainActor.run { UIApplication.shared.applicationState == .active }
    guard canStart else { return false }

    let attributes = TONDownloadActivityAttributes(
      artist: state.artist,
      itemId: state.itemId,
      title: state.title
    )
    do {
      let activity: Activity<TONDownloadActivityAttributes>
      if #available(iOS 16.2, *) {
        activity = try Activity.request(
          attributes: attributes,
          content: ActivityContent(state: contentState, staleDate: nil),
          pushType: nil
        )
      } else {
        activity = try Activity.request(
          attributes: attributes,
          contentState: contentState,
          pushType: nil
        )
      }
      activityByItemId[state.itemId] = activity
      lastStateByItemId[state.itemId] = contentState
      return true
    } catch {
      return false
    }
  }

  func end(itemId: Int) async {
    var activitiesById: [String: Activity<TONDownloadActivityAttributes>] = [:]
    if let trackedActivity = activityByItemId.removeValue(forKey: itemId) {
      activitiesById[trackedActivity.id] = trackedActivity
    }
    for activity in Activity<TONDownloadActivityAttributes>.activities
      where activity.attributes.itemId == itemId {
      activitiesById[activity.id] = activity
    }
    let finalState = lastStateByItemId[itemId]
      ?? TONDownloadActivityAttributes.ContentState(progressPercent: 100, status: "completed")
    lastStateByItemId.removeValue(forKey: itemId)
    for activity in activitiesById.values { await end(activity, contentState: finalState) }
  }

  func endActivities(except itemIds: Set<Int>) async {
    let systemItemIds = Activity<TONDownloadActivityAttributes>.activities.map { $0.attributes.itemId }
    let itemIdsToEnd = Set(systemItemIds + Array(activityByItemId.keys)).subtracting(itemIds)
    for itemId in itemIdsToEnd { await end(itemId: itemId) }
  }

  private func recoverActivity(
    itemId: Int,
    contentState: TONDownloadActivityAttributes.ContentState
  ) async -> Activity<TONDownloadActivityAttributes>? {
    if let trackedActivity = activityByItemId[itemId] { return trackedActivity }
    let matching = Activity<TONDownloadActivityAttributes>.activities.filter {
      $0.attributes.itemId == itemId
    }
    guard let recovered = matching.first else { return nil }
    activityByItemId[itemId] = recovered
    for duplicate in matching.dropFirst() { await end(duplicate, contentState: contentState) }
    return recovered
  }

  private func makeContentState(
    _ state: TONIosDownloadActivityState
  ) -> TONDownloadActivityAttributes.ContentState {
    let percent = max(0, min(100, Int((state.progress * 100).rounded())))
    return TONDownloadActivityAttributes.ContentState(
      progressPercent: percent,
      status: state.state
    )
  }

  private func update(
    _ activity: Activity<TONDownloadActivityAttributes>,
    contentState: TONDownloadActivityAttributes.ContentState
  ) async {
    if #available(iOS 16.2, *) {
      await activity.update(ActivityContent(state: contentState, staleDate: nil))
    } else {
      await activity.update(using: contentState)
    }
  }

  private func end(
    _ activity: Activity<TONDownloadActivityAttributes>,
    contentState: TONDownloadActivityAttributes.ContentState
  ) async {
    if #available(iOS 16.2, *) {
      await activity.end(
        ActivityContent(state: contentState, staleDate: nil),
        dismissalPolicy: .immediate
      )
    } else {
      await activity.end(using: contentState, dismissalPolicy: .immediate)
    }
  }
}
