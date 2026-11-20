package com.teamcoach.voicechanger

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VoiceChangerModule : Module() {
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

    /** Switch live — safe to call while in a call; takes effect on the next 10 ms frame. */
    Function("setPreset") { name: String ->
      val preset = VoiceEffectProcessor.Preset.fromName(name)
        ?: throw IllegalArgumentException("Unknown voice preset: $name")
      VoiceChangerInstaller.setPreset(preset)
      preset.name.lowercase()
    }
  }
}
