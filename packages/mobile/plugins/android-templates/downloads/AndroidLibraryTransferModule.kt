package com.ton.player.downloads

// Template source for the Android config plugin. Expo prebuild writes this into the generated Android project.
import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.UUID

class AndroidLibraryTransferModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val queueLock = Any()
  private val runner = AndroidLibraryTransferRunner(reactContext, ::emitProgress)
  private var activeJob: TransferJobState? = null
  private var pendingExportDestinationPromise: Promise? = null
  private val activityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != EXPORT_DESTINATION_PICKER_REQUEST_CODE) return
      val promise = synchronized(queueLock) {
        pendingExportDestinationPromise.also { pendingExportDestinationPromise = null }
      } ?: return
      promise.resolve(if (resultCode == Activity.RESULT_OK) data?.data?.toString() else null)
    }
  }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = "AndroidLibraryTransfer"

  @Suppress("UNUSED_PARAMETER")
  @ReactMethod
  fun addListener(eventName: String?) = Unit

  @Suppress("UNUSED_PARAMETER")
  @ReactMethod
  fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun startExport(request: ReadableMap, promise: Promise) {
    try {
      val jobId = request.getString("jobId") ?: UUID.randomUUID().toString()
      startJob(jobId, TransferSpec.Export(AndroidLibraryTransferRequestParser.parseExport(request)), promise)
    } catch (error: Exception) {
      promise.reject("android_library_transfer_export_request_failed", error)
    }
  }

  @ReactMethod
  fun pickExportDestination(fileName: String, promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject("android_library_transfer_no_activity", "No active Android activity")
      return
    }
    synchronized(queueLock) {
      if (pendingExportDestinationPromise != null) {
        promise.reject(
          "android_library_transfer_export_destination_pending",
          "Export destination picker is already open",
        )
        return
      }
      pendingExportDestinationPromise = promise
    }
    activity.runOnUiThread {
      try {
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "application/zip"
          putExtra(Intent.EXTRA_TITLE, fileName)
        }
        activity.startActivityForResult(intent, EXPORT_DESTINATION_PICKER_REQUEST_CODE)
      } catch (error: Exception) {
        synchronized(queueLock) { pendingExportDestinationPromise = null }
        promise.reject("android_library_transfer_pick_export_destination_failed", error)
      }
    }
  }

  @ReactMethod
  fun startImport(request: ReadableMap, promise: Promise) {
    try {
      val jobId = request.getString("jobId") ?: UUID.randomUUID().toString()
      startJob(jobId, TransferSpec.Import(AndroidLibraryTransferRequestParser.parseImport(request)), promise)
    } catch (error: Exception) {
      promise.reject("android_library_transfer_import_request_failed", error)
    }
  }

  @ReactMethod
  fun cancel(jobId: String, promise: Promise) {
    synchronized(queueLock) {
      if (activeJob?.id == jobId) {
        activeJob?.runningJob?.cancel(CancellationException("cancelled"))
      }
    }
    promise.resolve(null)
  }

  override fun invalidate() {
    scope.cancel("module-invalidated")
    synchronized(queueLock) {
      activeJob?.let(runner::cleanup)
      activeJob = null
      pendingExportDestinationPromise?.resolve(null)
      pendingExportDestinationPromise = null
    }
    super.invalidate()
  }

  private fun startJob(jobId: String, spec: TransferSpec, promise: Promise) {
    val job = TransferJobState(jobId, spec)
    synchronized(queueLock) {
      if (activeJob != null) {
        promise.reject("android_library_transfer_busy", LIBRARY_TRANSFER_BUSY_ERROR)
        return
      }
      activeJob = job
    }
    job.runningJob = scope.launch {
      try {
        emitCompleted(job.id, runner.run(job))
      } catch (_: CancellationException) {
        runner.cleanup(job)
        emitCancelled(job.id)
      } catch (error: Exception) {
        runner.cleanup(job)
        emitFailed(job.id, error.message ?: "Library transfer failed")
      } finally {
        synchronized(queueLock) {
          if (activeJob?.id == job.id) activeJob = null
        }
      }
    }
    promise.resolve(job.id)
  }

  private fun emitProgress(jobId: String, phase: String, current: Int, total: Int) =
    emitEvent(Arguments.createMap().apply {
      putString("jobId", jobId)
      putString("state", "progress")
      putString("phase", phase)
      putInt("current", current)
      putInt("total", total)
    })

  private fun emitCompleted(jobId: String, resultJson: String) =
    emitEvent(Arguments.createMap().apply {
      putString("jobId", jobId)
      putString("state", "completed")
      putString("resultJson", resultJson)
    })

  private fun emitFailed(jobId: String, errorMessage: String) =
    emitEvent(Arguments.createMap().apply {
      putString("jobId", jobId)
      putString("state", "failed")
      putString("error", errorMessage)
    })

  private fun emitCancelled(jobId: String) = emitEvent(Arguments.createMap().apply {
    putString("jobId", jobId)
    putString("state", "cancelled")
  })

  private fun emitEvent(payload: WritableMap) {
    if (!reactApplicationContext.hasActiveReactInstance()) return
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(LIBRARY_TRANSFER_EVENT, payload)
  }
}
