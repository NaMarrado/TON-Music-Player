package __PACKAGE_NAME__.audioboost

import android.media.audiofx.LoudnessEnhancer
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import __PACKAGE_NAME__.BuildConfig

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
      debugLog("attach failed session=$sessionId error=${error.message}")
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
      debugLog("setTargetGain failed value=$value error=${error.message}")
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
    if (attachedSessionId != 0) debugLog("release internal session=$attachedSessionId")
    loudnessEnhancer = null
    attachedSessionId = 0
  }

  private fun debugLog(message: String) {
    if (BuildConfig.DEBUG) Log.d(TAG, message)
  }
}
