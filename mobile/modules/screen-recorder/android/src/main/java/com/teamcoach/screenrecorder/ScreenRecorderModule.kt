package com.teamcoach.screenrecorder

import android.content.Intent
import java.io.File
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ScreenRecorderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ScreenRecorder")
    Events("onStopped", "onVoiceAction")

    OnCreate {
      RecordBridge.module = this@ScreenRecorderModule
      VoiceBridge.module = this@ScreenRecorderModule
    }

    OnDestroy {
      if (RecordBridge.module === this@ScreenRecorderModule) {
        RecordBridge.module = null
      }
      if (VoiceBridge.module === this@ScreenRecorderModule) {
        VoiceBridge.module = null
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
    // background (see VoiceKeepAliveService). Both calls are safe to repeat —
    // also how JS refreshes the Mute/Deafen button labels after toggling.
    Function("startVoiceService") { title: String, text: String, muted: Boolean, deafened: Boolean ->
      val context = appContext.reactContext ?: return@Function false
      val intent = Intent(context, VoiceKeepAliveService::class.java).apply {
        action = VoiceKeepAliveService.ACTION_START
        putExtra(VoiceKeepAliveService.EXTRA_TITLE, title)
        putExtra(VoiceKeepAliveService.EXTRA_TEXT, text)
        putExtra(VoiceKeepAliveService.EXTRA_MUTED, muted)
        putExtra(VoiceKeepAliveService.EXTRA_DEAFENED, deafened)
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

    // The finished recording sits in the app cache until the user picks
    // "Save" (-> gallery) or "Discard" in the prompt shown by JS.
    AsyncFunction("saveToGallery") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "App is not running", null)
        return@AsyncFunction
      }
      Thread {
        try {
          val file = File(context.cacheDir, ScreenRecordService.PENDING_FILE)
          if (!file.exists() || file.length() == 0L) {
            promise.reject("NO_RECORDING", "There is no recording to save", null)
            return@Thread
          }
          val uri = publishRecordingToGallery(context, file)
          file.delete()
          promise.resolve(uri)
        } catch (err: Exception) {
          promise.reject("SAVE_FAILED", "Could not save the video on your phone", err)
        }
      }.start()
    }

    AsyncFunction("discard") { promise: Promise ->
      val context = appContext.reactContext
      if (context != null) {
        File(context.cacheDir, ScreenRecordService.PENDING_FILE).delete()
      }
      promise.resolve(null)
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
