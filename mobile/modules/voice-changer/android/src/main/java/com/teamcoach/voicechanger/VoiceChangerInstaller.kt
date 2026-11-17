package com.teamcoach.voicechanger

import android.util.Log
import com.oney.WebRTCModule.WebRTCModuleOptions
import java.util.concurrent.Callable
import livekit.org.webrtc.ExternalAudioProcessingFactory

/**
 * Plugs [VoiceEffectProcessor] into react-native-webrtc's PeerConnectionFactory.
 *
 * WebRTCModule reads `WebRTCModuleOptions.audioProcessingFactoryFactory` in
 * its constructor, so this must run before the first getUserMedia — the
 * `withVoiceChanger` config plugin calls it from MainApplication.onCreate,
 * and VoiceChangerModule.OnCreate calls it again as a fallback (idempotent).
 */
object VoiceChangerInstaller {
  private const val TAG = "VoiceChanger"

  val processor = VoiceEffectProcessor()

  @Volatile private var factory: ExternalAudioProcessingFactory? = null
  @Volatile var installed = false
    private set

  @JvmStatic
  @Synchronized
  fun install() {
    if (installed) return
    val options = WebRTCModuleOptions.getInstance()
    if (options.audioProcessingFactoryFactory != null) {
      Log.w(TAG, "Another audioProcessingFactoryFactory is already set; voice changer disabled")
      return
    }
    options.audioProcessingFactoryFactory = Callable {
      val f = factory ?: ExternalAudioProcessingFactory().also {
        it.setCapturePostProcessing(processor)
        it.setBypassFlagForCapturePost(processor.preset == VoiceEffectProcessor.Preset.OFF)
        factory = it
      }
      f
    }
    installed = true
    Log.i(TAG, "Capture post-processing installed")
  }

  fun setPreset(preset: VoiceEffectProcessor.Preset) {
    processor.preset = preset
    // Skip the JNI round-trip entirely when no effect is selected.
    factory?.setBypassFlagForCapturePost(preset == VoiceEffectProcessor.Preset.OFF)
  }
}
