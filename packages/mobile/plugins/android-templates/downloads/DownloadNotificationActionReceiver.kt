package __PACKAGE_NAME__.downloads

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService

class DownloadNotificationActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent == null) return
    val action = intent.getStringExtra(DownloadNotifications.EXTRA_ACTION)
      ?: intent.action
      ?: return
    val itemId = intent.getIntExtra(DownloadNotifications.EXTRA_ITEM_ID, -1).takeIf { it > 0 }
    val activeCount = DownloadNotifications.readPersistedActiveIds(context).size
    DownloadNotifications.startForegroundService(context, if (activeCount > 0) activeCount else 1)
    DownloadNotifications.startTaskService(context, action, itemId)
    HeadlessJsTaskService.acquireWakeLockNow(context)
  }
}
