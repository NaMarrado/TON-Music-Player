package __PACKAGE_NAME__.downloads

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import __PACKAGE_NAME__.MainActivity

data class ActiveDownloadPayload(
  val id: Int,
  val title: String,
  val artist: String,
  val progress: Int,
  val status: String,
)

internal object DownloadNotificationBuilders {
  fun summary(context: Context, activeCount: Int): Notification {
    val label = when {
      activeCount <= 0 -> "Preparing downloads"
      activeCount == 1 -> "1 active download"
      else -> "$activeCount active downloads"
    }
    return NotificationCompat.Builder(context, DownloadNotifications.CHANNEL_ACTIVE)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle("TON downloads")
      .setContentText(label)
      .setContentIntent(downloadsIntent(context))
      .setGroup(DownloadNotifications.GROUP_KEY)
      .setGroupSummary(true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .build()
  }

  fun active(context: Context, payload: ActiveDownloadPayload): Notification {
    val statusText = when (payload.status) {
      "pending" -> "Queued"
      "retrying" -> "Retrying"
      else -> if (payload.artist.isBlank()) "Downloading" else payload.artist
    }
    return NotificationCompat.Builder(context, DownloadNotifications.CHANNEL_ACTIVE)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle(payload.title)
      .setContentText(statusText)
      .setSubText("${payload.progress}%")
      .setContentIntent(downloadsIntent(context))
      .setGroup(DownloadNotifications.GROUP_KEY)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setProgress(100, payload.progress, payload.status == "pending")
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .addAction(
        android.R.drawable.ic_menu_close_clear_cancel,
        "Cancel",
        actionIntent(context, DownloadNotifications.ACTION_CANCEL, payload.id),
      )
      .build()
  }

  fun completed(context: Context, title: String, artist: String): Notification =
    NotificationCompat.Builder(context, DownloadNotifications.CHANNEL_COMPLETE)
      .setSmallIcon(android.R.drawable.stat_sys_download_done)
      .setContentTitle(title)
      .setContentText(if (artist.isBlank()) "Download complete" else artist)
      .setContentIntent(downloadsIntent(context))
      .setGroup(DownloadNotifications.GROUP_KEY)
      .setAutoCancel(true)
      .setOngoing(false)
      .setOnlyAlertOnce(true)
      .build()

  fun error(
    context: Context,
    itemId: Int,
    title: String,
    artist: String,
    error: String?,
  ): Notification = NotificationCompat.Builder(context, DownloadNotifications.CHANNEL_ERROR)
    .setSmallIcon(android.R.drawable.stat_notify_error)
    .setContentTitle(title)
    .setContentText(error?.takeIf { it.isNotBlank() } ?: if (artist.isBlank()) "Download failed" else artist)
    .setContentIntent(downloadsIntent(context))
    .setGroup(DownloadNotifications.GROUP_KEY)
    .setAutoCancel(true)
    .setOnlyAlertOnce(true)
    .addAction(
      android.R.drawable.ic_menu_rotate,
      "Retry",
      actionIntent(context, DownloadNotifications.ACTION_RETRY, itemId),
    )
    .build()

  private fun downloadsIntent(context: Context): PendingIntent {
    val intent = Intent(
      Intent.ACTION_VIEW,
      Uri.parse("ton://downloads"),
      context,
      MainActivity::class.java,
    ).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    return PendingIntent.getActivity(
      context,
      9000,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun actionIntent(context: Context, action: String, itemId: Int): PendingIntent {
    val intent = Intent(context, DownloadNotificationActionReceiver::class.java).apply {
      this.action = action
      putExtra(
        DownloadNotifications.EXTRA_ACTION,
        if (action == DownloadNotifications.ACTION_CANCEL) "cancel" else "retry",
      )
      putExtra(DownloadNotifications.EXTRA_ITEM_ID, itemId)
    }
    val requestCode = itemId + if (action == DownloadNotifications.ACTION_CANCEL) 12000 else 13000
    return PendingIntent.getBroadcast(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}
