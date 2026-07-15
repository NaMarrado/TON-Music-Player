package __PACKAGE_NAME__.downloads

import android.app.Service
import android.content.Intent
import android.os.IBinder

class DownloadForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val activeCount = intent?.getIntExtra(DownloadNotifications.EXTRA_ACTIVE_COUNT, 0) ?: 0
    startForeground(
      DownloadNotifications.SUMMARY_NOTIFICATION_ID,
      DownloadNotifications.buildSummaryNotification(this, activeCount),
    )
    return START_STICKY
  }

  override fun onDestroy() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}
