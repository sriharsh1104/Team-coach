package com.teamcoach.voicechanger

import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VoiceChangerModule : Module() {
  private var lastCueAt = 0L

  private companion object {
    /** Several hands going up at once → one beep, not a burst. */
    const val CUE_MIN_GAP_MS = 1200L
  }

  override fun definition() = ModuleDefinition {
    Name("VoiceChanger")

    OnCreate {
      // Starts the attach loop (also done by the config plugin's MainApplication hook).
      VoiceChangerInstaller.install()
    }

    /** True when the LiveKit audio pipeline we plug into is part of this build. */
    Function("isAvailable") {
      VoiceChangerInstaller.available
    }

    /** True once the effect is attached to the live capture pipeline (after the first voice use). */
    Function("isActive") {
      VoiceChangerInstaller.active
    }

    /** Attach now — JS calls this when a voice session starts (idempotent). */
    Function("attach") {
      VoiceChangerInstaller.tryAttach()
    }

    Function("getPresets") {
      VoiceEffectProcessor.Preset.values().map { it.name.lowercase() }
    }

    Function("getPreset") {
      VoiceChangerInstaller.processor.preset.name.lowercase()
    }

    /**
     * Short "tu-tu" beep on the call stream, used when someone raises their hand.
     * ToneGenerator takes no audio focus, so it never ducks or pauses the call.
     */
    Function("playCue") {
      val now = SystemClock.elapsedRealtime()
      if (now - lastCueAt < CUE_MIN_GAP_MS) return@Function false
      lastCueAt = now
      try {
        val tone = ToneGenerator(AudioManager.STREAM_VOICE_CALL, 60)
        tone.startTone(ToneGenerator.TONE_PROP_BEEP2, 220)
        Handler(Looper.getMainLooper()).postDelayed({ tone.release() }, 500)
        true
      } catch (_: Throwable) {
        false
      }
    }

    /** Switch live — safe to call while in a call; takes effect on the next 10 ms frame. */
    Function("setPreset") { name: String ->
      val preset = VoiceEffectProcessor.Preset.fromName(name)
        ?: throw IllegalArgumentException("Unknown voice preset: $name")
      VoiceChangerInstaller.setPreset(preset)
      preset.name.lowercase()
    }
  }
}
