function getAudioBoostModuleSource(packageName) {
  return `package ${packageName}.audioboost

import android.media.audiofx.LoudnessEnhancer
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import ${packageName}.BuildConfig

class AudioBoostModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val TAG = "TONAudioBoost"
    private const val MAX_TARGET_GAIN_MB = 3200
  }

  private var attachedSessionId: Int = 0
  private var loudnessEnhancer: LoudnessEnhancer? = null

  override fun getName(): String = "AudioBoost"

  @ReactMethod
  fun attach(sessionId: Int, promise: Promise) {
    if (sessionId <= 0) {
      promise.reject("audio_boost_invalid_session", "Audio session ID must be greater than zero.")
      return
    }

    try {
      if (loudnessEnhancer != null && attachedSessionId == sessionId) {
        debugLog("attach reuse session=$sessionId")
        promise.resolve(null)
        return
      }

      releaseInternal()
      val instance = LoudnessEnhancer(sessionId)
      instance.setTargetGain(0)
      instance.enabled = false
      loudnessEnhancer = instance
      attachedSessionId = sessionId
      debugLog("attach ok session=$sessionId")
      promise.resolve(null)
    } catch (error: Exception) {
      releaseInternal()
      debugLog("attach failed session=$sessionId error=\${error.message}")
      promise.reject("audio_boost_attach_failed", error)
    }
  }

  @ReactMethod
  fun setTargetGainMb(value: Int, promise: Promise) {
    val instance = requireEnhancer(promise) ?: return

    try {
      val clampedValue = value.coerceIn(0, MAX_TARGET_GAIN_MB)
      instance.setTargetGain(clampedValue)
      instance.enabled = clampedValue > 0
      debugLog("setTargetGain ok value=$clampedValue session=$attachedSessionId")
      promise.resolve(null)
    } catch (error: Exception) {
      debugLog("setTargetGain failed value=$value error=\${error.message}")
      promise.reject("audio_boost_set_gain_failed", error)
    }
  }

  @ReactMethod
  fun release(promise: Promise) {
    debugLog("release requested session=$attachedSessionId")
    releaseInternal()
    promise.resolve(null)
  }

  override fun invalidate() {
    releaseInternal()
    super.invalidate()
  }

  private fun requireEnhancer(promise: Promise): LoudnessEnhancer? {
    if (loudnessEnhancer == null) {
      promise.reject("audio_boost_not_attached", "AudioBoost is not attached to a session.")
      return null
    }

    return loudnessEnhancer
  }

  private fun releaseInternal() {
    try {
      loudnessEnhancer?.release()
    } catch (_: Exception) {
      // Native audio effect release should not crash teardown.
    }

    if (attachedSessionId != 0) {
      debugLog("release internal session=$attachedSessionId")
    }

    loudnessEnhancer = null
    attachedSessionId = 0
  }

  private fun debugLog(message: String) {
    if (BuildConfig.DEBUG) {
      Log.d(TAG, message)
    }
  }
}
`;
}

function getAudioBoostPackageSource(packageName) {
  return `package ${packageName}.audioboost

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AudioBoostPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(AudioBoostModule(reactContext))
  }

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;
}

function getAudioEqualizerModuleSource(packageName) {
  return `package ${packageName}.audioequalizer

import android.media.audiofx.Equalizer
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import ${packageName}.BuildConfig

class AudioEqualizerModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val TAG = "TONEqualizer"
  }

  private var attachedSessionId: Int = 0
  private var equalizer: Equalizer? = null

  override fun getName(): String = "AudioEqualizer"

  @ReactMethod
  fun attach(sessionId: Int, promise: Promise) {
    if (sessionId <= 0) {
      promise.reject("audio_equalizer_invalid_session", "Audio session ID must be greater than zero.")
      return
    }

    try {
      if (equalizer != null && attachedSessionId == sessionId) {
        debugLog("attach reuse session=$sessionId")
        promise.resolve(createEqInfo(equalizer!!))
        return
      }

      releaseInternal()
      val instance = Equalizer(0, sessionId)
      instance.enabled = false
      equalizer = instance
      attachedSessionId = sessionId
      debugLog("attach ok session=$sessionId bands=\${instance.numberOfBands}")
      promise.resolve(createEqInfo(instance))
    } catch (error: Exception) {
      releaseInternal()
      debugLog("attach failed session=$sessionId error=\${error.message}")
      promise.reject("audio_equalizer_attach_failed", error)
    }
  }

  @ReactMethod
  fun detach(promise: Promise) {
    debugLog("detach requested session=$attachedSessionId")
    releaseInternal()
    promise.resolve(null)
  }

  @ReactMethod
  fun setEnabled(enabled: Boolean, promise: Promise) {
    val instance = requireEqualizer(promise) ?: return

    try {
      instance.enabled = enabled
      debugLog("setEnabled enabled=$enabled session=$attachedSessionId")
      promise.resolve(null)
    } catch (error: Exception) {
      debugLog("setEnabled failed enabled=$enabled error=\${error.message}")
      promise.reject("audio_equalizer_set_enabled_failed", error)
    }
  }

  @ReactMethod
  fun setBandLevel(band: Int, level: Int, promise: Promise) {
    val instance = requireEqualizer(promise) ?: return
    if (band < 0 || band >= instance.numberOfBands.toInt()) {
      promise.reject("audio_equalizer_invalid_band", "Band index $band is out of range.")
      return
    }

    try {
      val range = instance.bandLevelRange
      val clampedLevel = level.coerceIn(range[0].toInt(), range[1].toInt())
      instance.setBandLevel(band.toShort(), clampedLevel.toShort())
      promise.resolve(null)
    } catch (error: Exception) {
      debugLog("setBandLevel failed band=$band level=$level error=\${error.message}")
      promise.reject("audio_equalizer_set_band_level_failed", error)
    }
  }

  @ReactMethod
  fun getBandCount(promise: Promise) {
    val instance = requireEqualizer(promise) ?: return
    promise.resolve(instance.numberOfBands.toInt())
  }

  @ReactMethod
  fun getBandFrequencies(promise: Promise) {
    val instance = requireEqualizer(promise) ?: return
    val frequencies = Arguments.createArray()

    for (band in 0 until instance.numberOfBands.toInt()) {
      frequencies.pushInt(instance.getCenterFreq(band.toShort()) / 1000)
    }

    promise.resolve(frequencies)
  }

  @ReactMethod
  fun getBandLevelRange(promise: Promise) {
    val instance = requireEqualizer(promise) ?: return
    val range = instance.bandLevelRange
    val rangeMap = Arguments.createMap()
    rangeMap.putInt("min", range[0].toInt())
    rangeMap.putInt("max", range[1].toInt())
    promise.resolve(rangeMap)
  }

  override fun invalidate() {
    releaseInternal()
    super.invalidate()
  }

  private fun createEqInfo(instance: Equalizer) = Arguments.createMap().apply {
    putInt("bandCount", instance.numberOfBands.toInt())
    putArray("frequencies", Arguments.createArray().apply {
      for (band in 0 until instance.numberOfBands.toInt()) {
        pushInt(instance.getCenterFreq(band.toShort()) / 1000)
      }
    })
    putMap("levelRange", Arguments.createMap().apply {
      val range = instance.bandLevelRange
      putInt("min", range[0].toInt())
      putInt("max", range[1].toInt())
    })
  }

  private fun requireEqualizer(promise: Promise): Equalizer? {
    if (equalizer == null) {
      promise.reject("audio_equalizer_not_attached", "AudioEqualizer is not attached to a session.")
      return null
    }

    return equalizer
  }

  private fun releaseInternal() {
    try {
      equalizer?.release()
    } catch (_: Exception) {
      // Native audio effect release should not crash teardown.
    }

    if (attachedSessionId != 0) {
      debugLog("release internal session=$attachedSessionId")
    }
    equalizer = null
    attachedSessionId = 0
  }

  private fun debugLog(message: String) {
    if (BuildConfig.DEBUG) {
      Log.d(TAG, message)
    }
  }
}
`;
}

function getAudioEqualizerPackageSource(packageName) {
  return `package ${packageName}.audioequalizer

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AudioEqualizerPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(AudioEqualizerModule(reactContext))
  }

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;
}

function getDownloadNotificationsSource(packageName) {
  return `package ${packageName}.downloads

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import ${packageName}.MainActivity

data class ActiveDownloadPayload(
  val id: Int,
  val title: String,
  val artist: String,
  val progress: Int,
  val status: String,
)

object DownloadNotifications {
  const val CHANNEL_ACTIVE = "downloads-active"
  const val CHANNEL_COMPLETE = "downloads-complete"
  const val CHANNEL_ERROR = "downloads-error"
  const val GROUP_KEY = "ton-downloads"
  const val PREFS_NAME = "ton_download_notifications"
  const val PREFS_ACTIVE_IDS = "active_ids"
  const val ACTION_CANCEL = "${packageName}.DOWNLOAD_CANCEL"
  const val ACTION_RETRY = "${packageName}.DOWNLOAD_RETRY"
  const val EXTRA_ACTION = "action"
  const val EXTRA_ITEM_ID = "itemId"
  const val EXTRA_ACTIVE_COUNT = "activeCount"
  const val EXTRA_REASON = "reason"
  const val SUMMARY_NOTIFICATION_ID = 9400
  private const val ACTIVE_NOTIFICATION_BASE = 10000
  private const val COMPLETED_NOTIFICATION_BASE = 20000
  private const val ERROR_NOTIFICATION_BASE = 30000

  fun createChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val manager = notificationManager(context)
    val channels = listOf(
      NotificationChannel(
        CHANNEL_ACTIVE,
        "Active downloads",
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = "Active TON downloads"
        setShowBadge(false)
      },
      NotificationChannel(
        CHANNEL_COMPLETE,
        "Completed downloads",
        NotificationManager.IMPORTANCE_DEFAULT,
      ).apply {
        description = "Completed TON downloads"
        setShowBadge(false)
      },
      NotificationChannel(
        CHANNEL_ERROR,
        "Download errors",
        NotificationManager.IMPORTANCE_DEFAULT,
      ).apply {
        description = "Failed TON downloads"
        setShowBadge(false)
      },
    )

    manager.createNotificationChannels(channels)
  }

  fun getActiveNotificationId(itemId: Int): Int = ACTIVE_NOTIFICATION_BASE + itemId

  fun getCompletedNotificationId(itemId: Int): Int = COMPLETED_NOTIFICATION_BASE + itemId

  fun getErrorNotificationId(itemId: Int): Int = ERROR_NOTIFICATION_BASE + itemId

  fun readPersistedActiveIds(context: Context): Set<Int> {
    val values = prefs(context).getStringSet(PREFS_ACTIVE_IDS, emptySet()) ?: emptySet()
    return values.mapNotNull { it.toIntOrNull() }.toSet()
  }

  fun writePersistedActiveIds(context: Context, ids: Set<Int>) {
    prefs(context).edit().putStringSet(
      PREFS_ACTIVE_IDS,
      ids.map { it.toString() }.toSet(),
    ).apply()
  }

  fun dismissNotifications(context: Context, ids: Set<Int>) {
    if (ids.isEmpty()) {
      return
    }

    val manager = notificationManager(context)
    ids.forEach { id ->
      manager.cancel(getActiveNotificationId(id))
      manager.cancel(getCompletedNotificationId(id))
      manager.cancel(getErrorNotificationId(id))
    }

    val remainingActive = readPersistedActiveIds(context) - ids
    writePersistedActiveIds(context, remainingActive)
    if (remainingActive.isEmpty()) {
      manager.cancel(SUMMARY_NOTIFICATION_ID)
    }
  }

  fun syncActiveNotifications(context: Context, items: List<ActiveDownloadPayload>) {
    createChannels(context)
    val manager = notificationManager(context)
    val currentIds = items.map { it.id }.toSet()
    val previousIds = readPersistedActiveIds(context)

    items.forEach { payload ->
      manager.notify(
        getActiveNotificationId(payload.id),
        buildActiveNotification(context, payload),
      )
    }

    (previousIds - currentIds).forEach { staleId ->
      manager.cancel(getActiveNotificationId(staleId))
    }

    writePersistedActiveIds(context, currentIds)

    if (currentIds.isEmpty()) {
      manager.cancel(SUMMARY_NOTIFICATION_ID)
      stopForegroundService(context)
      return
    }

    startForegroundService(context, currentIds.size)
    manager.notify(
      SUMMARY_NOTIFICATION_ID,
      buildSummaryNotification(context, currentIds.size),
    )
  }

  fun showCompletedNotification(
    context: Context,
    itemId: Int,
    title: String,
    artist: String,
  ) {
    createChannels(context)
    notificationManager(context).notify(
      getCompletedNotificationId(itemId),
      NotificationCompat.Builder(context, CHANNEL_COMPLETE)
        .setSmallIcon(android.R.drawable.stat_sys_download_done)
        .setContentTitle(title)
        .setContentText(if (artist.isBlank()) "Download complete" else artist)
        .setContentIntent(createDownloadsIntent(context))
        .setGroup(GROUP_KEY)
        .setAutoCancel(true)
        .setOngoing(false)
        .setOnlyAlertOnce(true)
        .build(),
    )
  }

  fun showErrorNotification(
    context: Context,
    itemId: Int,
    title: String,
    artist: String,
    error: String?,
  ) {
    createChannels(context)
    notificationManager(context).notify(
      getErrorNotificationId(itemId),
      NotificationCompat.Builder(context, CHANNEL_ERROR)
        .setSmallIcon(android.R.drawable.stat_notify_error)
        .setContentTitle(title)
        .setContentText(error?.takeIf { it.isNotBlank() } ?: if (artist.isBlank()) "Download failed" else artist)
        .setContentIntent(createDownloadsIntent(context))
        .setGroup(GROUP_KEY)
        .setAutoCancel(true)
        .setOnlyAlertOnce(true)
        .addAction(
          android.R.drawable.ic_menu_rotate,
          "Retry",
          createActionIntent(context, ACTION_RETRY, itemId),
        )
        .build(),
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

  fun startTaskService(
    context: Context,
    action: String,
    itemId: Int?,
  ) {
    val intent = Intent(context, DownloadTaskService::class.java).apply {
      putExtra(EXTRA_ACTION, action)
      if (itemId != null && itemId > 0) {
        putExtra(EXTRA_ITEM_ID, itemId)
      }
      putExtra(EXTRA_REASON, action)
    }
    context.startService(intent)
  }

  fun buildSummaryNotification(context: Context, activeCount: Int): Notification {
    val label = when {
      activeCount <= 0 -> "Preparing downloads"
      activeCount == 1 -> "1 active download"
      else -> "\${activeCount} active downloads"
    }

    return NotificationCompat.Builder(context, CHANNEL_ACTIVE)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle("TON downloads")
      .setContentText(label)
      .setContentIntent(createDownloadsIntent(context))
      .setGroup(GROUP_KEY)
      .setGroupSummary(true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .build()
  }

  private fun buildActiveNotification(
    context: Context,
    payload: ActiveDownloadPayload,
  ): Notification {
    val statusText = when (payload.status) {
      "pending" -> "Queued"
      "retrying" -> "Retrying"
      else -> if (payload.artist.isBlank()) "Downloading" else payload.artist
    }
    val isIndeterminate = payload.status == "pending"

    return NotificationCompat.Builder(context, CHANNEL_ACTIVE)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle(payload.title)
      .setContentText(statusText)
      .setSubText("\${payload.progress}%")
      .setContentIntent(createDownloadsIntent(context))
      .setGroup(GROUP_KEY)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setProgress(100, payload.progress, isIndeterminate)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .addAction(
        android.R.drawable.ic_menu_close_clear_cancel,
        "Cancel",
        createActionIntent(context, ACTION_CANCEL, payload.id),
      )
      .build()
  }

  private fun createDownloadsIntent(context: Context): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("ton://downloads"), context, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }

    return PendingIntent.getActivity(
      context,
      9000,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun createActionIntent(
    context: Context,
    action: String,
    itemId: Int,
  ): PendingIntent {
    val intent = Intent(context, DownloadNotificationActionReceiver::class.java).apply {
      this.action = action
      putExtra(EXTRA_ACTION, if (action == ACTION_CANCEL) "cancel" else "retry")
      putExtra(EXTRA_ITEM_ID, itemId)
    }

    return PendingIntent.getBroadcast(
      context,
      itemId + if (action == ACTION_CANCEL) 12000 else 13000,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun notificationManager(context: Context): NotificationManager {
    return context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  }
}
`;
}

function getAndroidDownloadsModuleSource(packageName) {
  return `package ${packageName}.downloads

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
        if (items.getType(index) != ReadableType.Map) {
          continue
        }
        val entry = items.getMap(index)
        payloads.add(entry.toActiveDownloadPayload())
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
        val value = ids.getInt(index)
        if (value > 0) {
          itemIds.add(value)
        }
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
      val normalizedItemId = if (itemId > 0) itemId else null
      val activeCount = DownloadNotifications.readPersistedActiveIds(reactApplicationContext).size
      DownloadNotifications.startForegroundService(
        reactApplicationContext,
        if (activeCount > 0) activeCount else 1,
      )
      DownloadNotifications.startTaskService(
        reactApplicationContext,
        action,
        normalizedItemId,
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

  private fun ReadableMap.toActiveDownloadPayload(): ActiveDownloadPayload {
    return ActiveDownloadPayload(
      id = getInt("id"),
      title = getString("title") ?: "Download",
      artist = getString("artist") ?: "",
      progress = getDouble("progress").times(100).toInt().coerceIn(0, 100),
      status = getString("status") ?: "downloading",
    )
  }
}
`;
}

function getAndroidDownloadsPackageSource(packageName) {
  return `package ${packageName}.downloads

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AndroidDownloadsPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(
      AndroidDownloadsModule(reactContext),
      AndroidLibraryTransferModule(reactContext),
    )
  }

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;
}

function getDownloadForegroundServiceSource(packageName) {
  return `package ${packageName}.downloads

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
`;
}

function getDownloadNotificationActionReceiverSource(packageName) {
  return `package ${packageName}.downloads

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService

class DownloadNotificationActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent == null) {
      return
    }

    val action = intent.getStringExtra(DownloadNotifications.EXTRA_ACTION)
      ?: intent.action
      ?: return
    val itemId = intent.getIntExtra(DownloadNotifications.EXTRA_ITEM_ID, -1)
      .takeIf { it > 0 }

    val activeCount = DownloadNotifications.readPersistedActiveIds(context).size
    DownloadNotifications.startForegroundService(
      context,
      if (activeCount > 0) activeCount else 1,
    )
    DownloadNotifications.startTaskService(context, action, itemId)
    HeadlessJsTaskService.acquireWakeLockNow(context)
  }
}
`;
}

function getDownloadTaskServiceSource(packageName) {
  return `package ${packageName}.downloads

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class DownloadTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    return intent?.extras?.let {
      HeadlessJsTaskConfig(
        "TONDownloadTask",
        Arguments.fromBundle(it),
        30 * 60 * 1000,
        true,
      )
    }
  }
}
`;
}

function getFfmpegKitAndroidBootstrapSource() {
  return `def ffmpegKitRepoDir = new File(rootDir, '.gradle/ffmpeg-kit-repo')
def ffmpegKitArtifactVersion = '6.0-2'
def ffmpegKitArtifactDir = new File(ffmpegKitRepoDir, "com/arthenica/ffmpeg-kit-audio/\${ffmpegKitArtifactVersion}")
def ffmpegKitAarFile = new File(ffmpegKitArtifactDir, "ffmpeg-kit-audio-\${ffmpegKitArtifactVersion}.aar")
def ffmpegKitPomFile = new File(ffmpegKitArtifactDir, "ffmpeg-kit-audio-\${ffmpegKitArtifactVersion}.pom")
def ffmpegKitAarUrl = 'https://raw.githubusercontent.com/DucLQ92/ffmpeg-kit-audio/main/com/arthenica/ffmpeg-kit-audio/6.0-2/ffmpeg-kit-audio-6.0-2.aar'
def ffmpegKitAarSha256 = 'a53e5628fca2a17aa8f8fdc14322d39b9e6d22e9e9886cda8eded47a058cfcf6'
def ffmpegKitPomContents = """<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.arthenica</groupId>
  <artifactId>ffmpeg-kit-audio</artifactId>
  <version>\${ffmpegKitArtifactVersion}</version>
  <packaging>aar</packaging>
  <dependencies>
    <dependency>
      <groupId>com.arthenica</groupId>
      <artifactId>smart-exception-common</artifactId>
      <version>0.2.1</version>
    </dependency>
    <dependency>
      <groupId>com.arthenica</groupId>
      <artifactId>smart-exception-java</artifactId>
      <version>0.2.1</version>
    </dependency>
  </dependencies>
</project>
"""

def sha256Hex = { File file ->
    def digest = java.security.MessageDigest.getInstance('SHA-256')
    file.withInputStream { input ->
        byte[] buffer = new byte[8192]
        int read = 0
        while ((read = input.read(buffer)) != -1) {
            digest.update(buffer, 0, read)
        }
    }
    return digest.digest().collect { String.format('%02x', it) }.join()
}

def downloadFile = { String sourceUrl, File targetFile ->
    def connection = new URL(sourceUrl).openConnection()
    connection.setRequestProperty('User-Agent', 'TON-Android-Build')
    connection.connect()

    try {
        if (connection instanceof java.net.HttpURLConnection) {
            def statusCode = connection.responseCode
            if (statusCode >= 400) {
                def message = "Failed to download FFmpegKit Android artifact from " + sourceUrl + ": HTTP " + statusCode
                if (connection.responseMessage != null) {
                    message += " " + connection.responseMessage
                }
                throw new GradleException(message)
            }
        }

        targetFile.withOutputStream { output ->
            connection.getInputStream().withCloseable { input ->
                input.transferTo(output)
            }
        }
    } finally {
        if (connection instanceof java.net.HttpURLConnection) {
            connection.disconnect()
        }
    }
}

def ensureLocalFfmpegKitArtifact = {
    ffmpegKitArtifactDir.mkdirs()

    if (!ffmpegKitAarFile.exists() || sha256Hex(ffmpegKitAarFile) != ffmpegKitAarSha256) {
        if (ffmpegKitAarFile.exists()) {
            ffmpegKitAarFile.delete()
        }

        logger.lifecycle("Downloading FFmpegKit Android artifact into \${ffmpegKitAarFile}")
        downloadFile(ffmpegKitAarUrl, ffmpegKitAarFile)

        def actualSha = sha256Hex(ffmpegKitAarFile)
        if (actualSha != ffmpegKitAarSha256) {
            ffmpegKitAarFile.delete()
            throw new GradleException("Downloaded FFmpegKit artifact checksum mismatch. Expected \${ffmpegKitAarSha256}, got \${actualSha}.")
        }
    }

    if (!ffmpegKitPomFile.exists() || ffmpegKitPomFile.text != ffmpegKitPomContents) {
        ffmpegKitPomFile.text = ffmpegKitPomContents
    }
}

ensureLocalFfmpegKitArtifact()`;
}

module.exports = {
  getAudioBoostModuleSource,
  getAudioBoostPackageSource,
  getAudioEqualizerModuleSource,
  getAudioEqualizerPackageSource,
  getFfmpegKitAndroidBootstrapSource,
  getDownloadNotificationsSource,
  getAndroidDownloadsModuleSource,
  getAndroidDownloadsPackageSource,
  getDownloadForegroundServiceSource,
  getDownloadNotificationActionReceiverSource,
  getDownloadTaskServiceSource,
};
