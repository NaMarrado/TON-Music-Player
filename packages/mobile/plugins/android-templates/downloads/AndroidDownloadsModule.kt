package __PACKAGE_NAME__.downloads

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType

class AndroidDownloadsModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AndroidDownloads"

  @ReactMethod
  fun createChannels(promise: Promise) {
    try {
      DownloadNotifications.createChannels(reactApplicationContext)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("android_downloads_channels_failed", error)
    }
  }

  @ReactMethod
  fun syncActiveDownloads(items: ReadableArray, promise: Promise) {
    try {
      val payloads = mutableListOf<ActiveDownloadPayload>()
      for (index in 0 until items.size()) {
        if (items.getType(index) == ReadableType.Map) {
          payloads.add(items.getMap(index).toActiveDownloadPayload())
        }
      }
      DownloadNotifications.syncActiveNotifications(reactApplicationContext, payloads)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("android_downloads_sync_failed", error)
    }
  }

  @ReactMethod
  fun showCompletedDownload(payload: ReadableMap, promise: Promise) {
    try {
      DownloadNotifications.showCompletedNotification(
        reactApplicationContext,
        payload.getInt("id"),
        payload.getString("title") ?: "Download complete",
        payload.getString("artist") ?: "",
      )
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("android_downloads_complete_failed", error)
    }
  }

  @ReactMethod
  fun showErrorDownload(payload: ReadableMap, promise: Promise) {
    try {
      DownloadNotifications.showErrorNotification(
        reactApplicationContext,
        payload.getInt("id"),
        payload.getString("title") ?: "Download failed",
        payload.getString("artist") ?: "",
        payload.getString("error"),
      )
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("android_downloads_error_failed", error)
    }
  }

  @ReactMethod
  fun dismissDownloadNotifications(ids: ReadableArray, promise: Promise) {
    try {
      val itemIds = mutableSetOf<Int>()
      for (index in 0 until ids.size()) {
        ids.getInt(index).takeIf { it > 0 }?.let(itemIds::add)
      }
      DownloadNotifications.dismissNotifications(reactApplicationContext, itemIds)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("android_downloads_dismiss_failed", error)
    }
  }

  @ReactMethod
  fun startBackgroundWork(action: String, itemId: Int, promise: Promise) {
    try {
      val activeCount = DownloadNotifications.readPersistedActiveIds(reactApplicationContext).size
      DownloadNotifications.startForegroundService(
        reactApplicationContext,
        if (activeCount > 0) activeCount else 1,
      )
      DownloadNotifications.startTaskService(
        reactApplicationContext,
        action,
        itemId.takeIf { it > 0 },
      )
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("android_downloads_background_failed", error)
    }
  }

  @ReactMethod
  fun stopBackgroundWork(promise: Promise) {
    try {
      DownloadNotifications.stopForegroundService(reactApplicationContext)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("android_downloads_stop_failed", error)
    }
  }

  private fun ReadableMap.toActiveDownloadPayload() = ActiveDownloadPayload(
    id = getInt("id"),
    title = getString("title") ?: "Download",
    artist = getString("artist") ?: "",
    progress = getDouble("progress").times(100).toInt().coerceIn(0, 100),
    status = getString("status") ?: "downloading",
  )
}
