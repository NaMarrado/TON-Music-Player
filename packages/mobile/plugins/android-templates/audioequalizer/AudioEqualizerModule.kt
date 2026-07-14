package __PACKAGE_NAME__.audioequalizer

import android.media.audiofx.Equalizer
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import __PACKAGE_NAME__.BuildConfig

class AudioEqualizerModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  companion object { private const val TAG = "TONEqualizer" }
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
      debugLog("attach ok session=$sessionId bands=${instance.numberOfBands}")
      promise.resolve(createEqInfo(instance))
    } catch (error: Exception) {
      releaseInternal()
      debugLog("attach failed session=$sessionId error=${error.message}")
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
      debugLog("setEnabled failed enabled=$enabled error=${error.message}")
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
      instance.setBandLevel(band.toShort(), level.coerceIn(range[0].toInt(), range[1].toInt()).toShort())
      promise.resolve(null)
    } catch (error: Exception) {
      debugLog("setBandLevel failed band=$band level=$level error=${error.message}")
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
    promise.resolve(Arguments.createArray().apply {
      for (band in 0 until instance.numberOfBands.toInt()) {
        pushInt(instance.getCenterFreq(band.toShort()) / 1000)
      }
    })
  }

  @ReactMethod
  fun getBandLevelRange(promise: Promise) {
    val instance = requireEqualizer(promise) ?: return
    promise.resolve(Arguments.createMap().apply {
      val range = instance.bandLevelRange
      putInt("min", range[0].toInt())
      putInt("max", range[1].toInt())
    })
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
    if (attachedSessionId != 0) debugLog("release internal session=$attachedSessionId")
    equalizer = null
    attachedSessionId = 0
  }

  private fun debugLog(message: String) {
    if (BuildConfig.DEBUG) Log.d(TAG, message)
  }
}
