package __PACKAGE_NAME__.downloads

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class DownloadTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? = intent?.extras?.let {
    HeadlessJsTaskConfig(
      "TONDownloadTask",
      Arguments.fromBundle(it),
      30 * 60 * 1000,
      true,
    )
  }
}
