package com.teamcoach.livestreamer

import android.content.Intent
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LiveStreamerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LiveStreamer")
    Events("onStarted", "onStopped", "onError")

    OnCreate {
      LiveBridge.module = this@LiveStreamerModule
    }

    OnDestroy {
      if (LiveBridge.module === this@LiveStreamerModule) {
        LiveBridge.module = null
      }
    }

    Function("isLive") {
      LiveBridge.live.get()
    }

    AsyncFunction("start") { rtmpUrl: String, streamKey: String, promise: Promise ->
      if (LiveBridge.live.get()) {
        promise.resolve(null)
        return@AsyncFunction
      }
      if (!LiveBridge.starting.compareAndSet(false, true)) {
        promise.reject("BUSY", "Live is already starting", null)
        return@AsyncFunction
      }
      val base = rtmpUrl.trim().trimEnd('/')
      val key = streamKey.trim()
      if (base.isEmpty() || key.isEmpty()) {
        LiveBridge.starting.set(false)
        promise.reject("BAD_ARGS", "RTMP URL and stream key are required", null)
        return@AsyncFunction
      }
      if (!base.startsWith("rtmp://", ignoreCase = true) &&
        !base.startsWith("rtmps://", ignoreCase = true)
      ) {
        LiveBridge.starting.set(false)
        promise.reject("BAD_ARGS", "URL must start with rtmp:// or rtmps://", null)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        LiveBridge.starting.set(false)
        promise.reject("NO_ACTIVITY", "Open the app and try again", null)
        return@AsyncFunction
      }
      LiveBridge.pendingEndpoint = "$base/$key"
      LiveBridge.startPromise = promise
      activity.startActivity(Intent(activity, LiveCapturePermissionActivity::class.java))
    }

    AsyncFunction("stop") { promise: Promise ->
      if (!LiveBridge.live.get() && !LiveBridge.starting.get()) {
        promise.resolve(null)
        return@AsyncFunction
      }
      LiveBridge.stopPromise = promise
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "App is not running", null)
        return@AsyncFunction
      }
      val intent = Intent(context, LiveStreamService::class.java).apply {
        action = LiveStreamService.ACTION_STOP
      }
      context.startService(intent)
    }
  }
}
