package com.teamcoach.voicechanger

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.livekit.reactnative.LiveKitReactNative
import com.livekit.reactnative.audio.processing.AudioProcessingController
import com.livekit.reactnative.audio.processing.AudioProcessorInterface
import java.nio.ByteBuffer

/**
 * Plugs [VoiceEffectProcessor] into LiveKit React Native's audio pipeline.
 *
 * Old approach (removed): assigning `WebRTCModuleOptions.audioProcessingFactoryFactory`
 * ourselves. @livekit/react-native 3.x owns that field — `LiveKitReactNative.setup()`
 * (run by its Expo plugin inside ApplicationLifecycleDispatcher, i.e. AFTER our
 * Application.onCreate hook) overwrote it, so the effect silently never ran.
 *
 * Supported approach: LiveKit exposes `LiveKitReactNative.audioProcessingController`
 * with a `capturePostProcessor` slot. The controller only exists once WebRTC's
 * PeerConnectionFactory has been built (first use of voice), so we attach lazily:
 * a light poll retries until it exists and re-attaches if it is ever re-created
 * (e.g. after a JS reload). JS also calls [tryAttach] when a voice session starts.
 *
 * It sits on the capture path below both the mediasoup (self-hosted) and the
 * LiveKit (hosted) transports, so team and guild voice get the same effect.
 */
object VoiceChangerInstaller {
  private const val TAG = "VoiceChanger"
  private const val POLL_MS = 1500L

  val processor = VoiceEffectProcessor()

  private val bridge = object : AudioProcessorInterface {
    // Keep enabled whenever the noise gate or a voice preset needs the buffer.
    override fun isEnabled(): Boolean =
      processor.noiseGateEnabled || processor.preset != VoiceEffectProcessor.Preset.OFF
    override fun getName(): String = "sacred-voice-changer"
    override fun initializeAudioProcessing(sampleRateHz: Int, numChannels: Int) =
      processor.initialize(sampleRateHz, numChannels)
    override fun resetAudioProcessing(newRate: Int) = processor.reset(newRate)
    override fun processAudio(numBands: Int, numFrames: Int, buffer: ByteBuffer) =
      processor.process(numBands, numFrames, buffer)
  }

  private val main = Handler(Looper.getMainLooper())
  @Volatile private var attachedTo: AudioProcessingController? = null
  private var polling = false

  /** True when the LiveKit audio pipeline classes are present in this build. */
  val available: Boolean
    get() = try {
      Class.forName("com.livekit.reactnative.LiveKitReactNative")
      true
    } catch (_: Throwable) {
      false
    }

  /** True once our processor is attached to the live capture pipeline. */
  val active: Boolean
    get() = attachedTo != null

  /**
   * Called from MainApplication.onCreate (config plugin) and the module's
   * OnCreate. Only starts the retry loop — LiveKit is not set up yet at this point.
   */
  @JvmStatic
  @Synchronized
  fun install() {
    if (polling) return
    polling = true
    main.post(pollTick)
  }

  private val pollTick = object : Runnable {
    override fun run() {
      tryAttach()
      main.postDelayed(this, POLL_MS)
    }
  }

  /** Attach (or re-attach) to LiveKit's current audio processing controller. */
  @JvmStatic
  @Synchronized
  fun tryAttach(): Boolean {
    val controller = try {
      LiveKitReactNative.audioProcessingController
    } catch (_: IllegalStateException) {
      // WebRTC isn't loaded yet / controller was released — try again later.
      attachedTo = null
      return false
    } catch (err: Throwable) {
      Log.w(TAG, "audio pipeline unavailable", err)
      attachedTo = null
      return false
    }
    if (attachedTo === controller) return true
    controller.capturePostProcessor = bridge
    // Only force the post-processor on when a preset/gate actually needs it.
    // Leaving it always-on with a pumping noise gate caused mid-call rumble.
    controller.bypassCapturePostProcessing =
      !(processor.noiseGateEnabled || processor.preset != VoiceEffectProcessor.Preset.OFF)
    attachedTo = controller
    Log.i(TAG, "Voice changer attached to LiveKit audio pipeline")
    return true
  }

  fun setPreset(preset: VoiceEffectProcessor.Preset) {
    processor.preset = preset
    if (tryAttach()) {
      attachedTo?.bypassCapturePostProcessing =
        !(processor.noiseGateEnabled || processor.preset != VoiceEffectProcessor.Preset.OFF)
    }
  }
}
