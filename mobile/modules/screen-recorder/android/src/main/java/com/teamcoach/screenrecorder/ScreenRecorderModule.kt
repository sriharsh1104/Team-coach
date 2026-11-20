package com.teamcoach.screenrecorder

import android.content.Intent
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ScreenRecorderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ScreenRecorder")
    Events("onStopped")

    OnCreate {
      RecordBridge.module = this@ScreenRecorderModule
    }

    OnDestroy {
      if (RecordBridge.module === this@ScreenRecorderModule) {
        RecordBridge.module = null
      }
    }

    Function("isRecording") {
      RecordBridge.recording.get()
    }

    AsyncFunction("start") { promise: Promise ->
      if (RecordBridge.recording.get()) {
        promise.resolve(null)
        return@AsyncFunction
      }
      if (!RecordBridge.starting.compareAndSet(false, true)) {
        promise.reject("BUSY", "Recording is already starting", null)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        RecordBridge.starting.set(false)
        promise.reject("NO_ACTIVITY", "Open the app and try again", null)
        return@AsyncFunction
      }
      RecordBridge.startPromise = promise
      activity.startActivity(Intent(activity, CapturePermissionActivity::class.java))
    }

    // Foreground service that keeps an active voice channel alive in the
    // background (see VoiceKeepAliveService). Both calls are safe to repeat.
    Function("startVoiceService") { title: String, text: String ->
      val context = appContext.reactContext ?: return@Function false
      val intent = Intent(context, VoiceKeepAliveService::class.java).apply {
        action = VoiceKeepAliveService.ACTION_START
        putExtra(VoiceKeepAliveService.EXTRA_TITLE, title)
        putExtra(VoiceKeepAliveService.EXTRA_TEXT, text)
      }
      try {
        if (android.os.Build.VERSION.SDK_INT >= 26) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        true
      } catch (_: Exception) {
        false
      }
    }

    Function("stopVoiceService") {
      val context = appContext.reactContext ?: return@Function false
      try {
        context.startService(
          Intent(context, VoiceKeepAliveService::class.java).apply {
            action = VoiceKeepAliveService.ACTION_STOP
          },
        )
        true
      } catch (_: Exception) {
        // Service not running (or app in background and not allowed) — nothing to stop.
        false
      }
    }

    AsyncFunction("stop") { promise: Promise ->
      if (!RecordBridge.recording.get()) {
        promise.resolve(null)
        return@AsyncFunction
      }
      RecordBridge.stopPromise = promise
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "App is not running", null)
        return@AsyncFunction
      }
      val intent = Intent(context, ScreenRecordService::class.java).apply {
        action = ScreenRecordService.ACTION_STOP
      }
      context.startService(intent)
    }
  }
}
