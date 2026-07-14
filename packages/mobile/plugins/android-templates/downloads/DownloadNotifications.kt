package __PACKAGE_NAME__.downloads

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat

object DownloadNotifications {
  const val CHANNEL_ACTIVE = "downloads-active"
  const val CHANNEL_COMPLETE = "downloads-complete"
  const val CHANNEL_ERROR = "downloads-error"
  const val GROUP_KEY = "ton-downloads"
  const val PREFS_NAME = "ton_download_notifications"
  const val PREFS_ACTIVE_IDS = "active_ids"
  const val ACTION_CANCEL = "__PACKAGE_NAME__.DOWNLOAD_CANCEL"
  const val ACTION_RETRY = "__PACKAGE_NAME__.DOWNLOAD_RETRY"
  const val EXTRA_ACTION = "action"
  const val EXTRA_ITEM_ID = "itemId"
  const val EXTRA_ACTIVE_COUNT = "activeCount"
  const val EXTRA_REASON = "reason"
  const val SUMMARY_NOTIFICATION_ID = 9400
  private const val ACTIVE_NOTIFICATION_BASE = 10000
  private const val COMPLETED_NOTIFICATION_BASE = 20000
  private const val ERROR_NOTIFICATION_BASE = 30000

  fun createChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    notificationManager(context).createNotificationChannels(listOf(
      NotificationChannel(CHANNEL_ACTIVE, "Active downloads", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Active TON downloads"
        setShowBadge(false)
      },
      NotificationChannel(CHANNEL_COMPLETE, "Completed downloads", NotificationManager.IMPORTANCE_DEFAULT).apply {
        description = "Completed TON downloads"
        setShowBadge(false)
      },
      NotificationChannel(CHANNEL_ERROR, "Download errors", NotificationManager.IMPORTANCE_DEFAULT).apply {
        description = "Failed TON downloads"
        setShowBadge(false)
      },
    ))
  }

  fun getActiveNotificationId(itemId: Int) = ACTIVE_NOTIFICATION_BASE + itemId
  fun getCompletedNotificationId(itemId: Int) = COMPLETED_NOTIFICATION_BASE + itemId
  fun getErrorNotificationId(itemId: Int) = ERROR_NOTIFICATION_BASE + itemId

  fun readPersistedActiveIds(context: Context): Set<Int> =
    (prefs(context).getStringSet(PREFS_ACTIVE_IDS, emptySet()) ?: emptySet())
      .mapNotNull { it.toIntOrNull() }
      .toSet()

  fun writePersistedActiveIds(context: Context, ids: Set<Int>) {
    prefs(context).edit().putStringSet(PREFS_ACTIVE_IDS, ids.map(Int::toString).toSet()).apply()
  }

  fun dismissNotifications(context: Context, ids: Set<Int>) {
    if (ids.isEmpty()) return
    val manager = notificationManager(context)
    ids.forEach { id ->
      manager.cancel(getActiveNotificationId(id))
      manager.cancel(getCompletedNotificationId(id))
      manager.cancel(getErrorNotificationId(id))
    }
    val remaining = readPersistedActiveIds(context) - ids
    writePersistedActiveIds(context, remaining)
    if (remaining.isEmpty()) manager.cancel(SUMMARY_NOTIFICATION_ID)
  }

  fun syncActiveNotifications(context: Context, items: List<ActiveDownloadPayload>) {
    createChannels(context)
    val manager = notificationManager(context)
    val currentIds = items.map { it.id }.toSet()
    val previousIds = readPersistedActiveIds(context)
    items.forEach { payload ->
      manager.notify(getActiveNotificationId(payload.id), DownloadNotificationBuilders.active(context, payload))
    }
    (previousIds - currentIds).forEach { manager.cancel(getActiveNotificationId(it)) }
    writePersistedActiveIds(context, currentIds)
    if (currentIds.isEmpty()) {
      manager.cancel(SUMMARY_NOTIFICATION_ID)
      stopForegroundService(context)
      return
    }
    startForegroundService(context, currentIds.size)
    manager.notify(SUMMARY_NOTIFICATION_ID, buildSummaryNotification(context, currentIds.size))
  }

  fun showCompletedNotification(context: Context, itemId: Int, title: String, artist: String) {
    createChannels(context)
    notificationManager(context).notify(
      getCompletedNotificationId(itemId),
      DownloadNotificationBuilders.completed(context, title, artist),
    )
  }

  fun showErrorNotification(context: Context, itemId: Int, title: String, artist: String, error: String?) {
    createChannels(context)
    notificationManager(context).notify(
      getErrorNotificationId(itemId),
      DownloadNotificationBuilders.error(context, itemId, title, artist, error),
    )
  }

  fun startForegroundService(context: Context, activeCount: Int) {
    val intent = Intent(context, DownloadForegroundService::class.java).apply {
      putExtra(EXTRA_ACTIVE_COUNT, activeCount)
    }
    ContextCompat.startForegroundService(context, intent)
  }

  fun stopForegroundService(context: Context) {
    context.stopService(Intent(context, DownloadForegroundService::class.java))
  }

  fun startTaskService(context: Context, action: String, itemId: Int?) {
    val intent = Intent(context, DownloadTaskService::class.java).apply {
      putExtra(EXTRA_ACTION, action)
      if (itemId != null && itemId > 0) putExtra(EXTRA_ITEM_ID, itemId)
      putExtra(EXTRA_REASON, action)
    }
    context.startService(intent)
  }

  fun buildSummaryNotification(context: Context, activeCount: Int): Notification =
    DownloadNotificationBuilders.summary(context, activeCount)

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun notificationManager(context: Context) =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
}
