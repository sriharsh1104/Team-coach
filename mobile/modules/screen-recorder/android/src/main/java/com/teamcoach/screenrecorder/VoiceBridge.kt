package com.teamcoach.screenrecorder

import android.os.Handler
import android.os.Looper

/**
 * Relays a tap on the ongoing-call notification's Mute/Deafen/Leave buttons
 * (handled in VoiceKeepAliveService, a plain Android Service with no direct
 * access to the Expo module bridge) over to JS as an "onVoiceAction" event.
 * Mirrors RecordBridge's module-holder pattern for the screen recorder.
 */
internal object VoiceBridge {
  private val main = Handler(Looper.getMainLooper())
  var module: ScreenRecorderModule? = null

  fun notifyAction(action: String) {
    main.post {
      module?.sendEvent("onVoiceAction", mapOf("action" to action))
    }
  }
}
