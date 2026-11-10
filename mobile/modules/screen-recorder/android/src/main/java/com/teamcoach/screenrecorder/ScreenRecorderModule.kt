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
