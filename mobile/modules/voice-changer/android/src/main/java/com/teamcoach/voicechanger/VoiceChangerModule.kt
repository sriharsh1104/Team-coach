package com.teamcoach.voicechanger

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VoiceChangerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VoiceChanger")

    OnCreate {
      // Fallback if the config plugin's MainApplication hook is missing.
      VoiceChangerInstaller.install()
    }

    /** True when our processor is wired into WebRTC's capture path. */
    Function("isAvailable") {
      VoiceChangerInstaller.installed
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
