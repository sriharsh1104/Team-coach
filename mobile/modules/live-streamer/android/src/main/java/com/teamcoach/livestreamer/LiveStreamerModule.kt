package com.teamcoach.livestreamer

import android.content.Intent
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray

class LiveStreamerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LiveStreamer")
    Events("onStarted", "onStopped", "onError", "onPaused")

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

    Function("isPaused") {
      LiveBridge.paused.get()
    }

    /**
     * destinationsJson: JSON array of { "url": "rtmp…", "key": "…" } (1–3 items).
     * Same screen capture is published to every destination at once.
     */
    AsyncFunction("start") { destinationsJson: String, promise: Promise ->
      if (LiveBridge.live.get()) {
        promise.resolve(null)
        return@AsyncFunction
      }
      if (!LiveBridge.starting.compareAndSet(false, true)) {
        promise.reject("BUSY", "Live is already starting", null)
        return@AsyncFunction
      }

      val endpoints = ArrayList<String>()
      try {
        val arr = JSONArray(destinationsJson)
        for (i in 0 until arr.length()) {
          val obj = arr.getJSONObject(i)
          val base = obj.optString("url", "").trim().trimEnd('/')
          val key = obj.optString("key", "").trim()
          if (base.isEmpty() || key.isEmpty()) continue
          if (!base.startsWith("rtmp://", ignoreCase = true) &&
            !base.startsWith("rtmps://", ignoreCase = true)
          ) {
            LiveBridge.starting.set(false)
            promise.reject("BAD_ARGS", "URL must start with rtmp:// or rtmps://", null)
            return@AsyncFunction
          }
          endpoints.add("$base/$key")
        }
      } catch (err: Exception) {
        LiveBridge.starting.set(false)
        promise.reject("BAD_ARGS", "Invalid destinations JSON", err)
        return@AsyncFunction
      }

      if (endpoints.isEmpty()) {
        LiveBridge.starting.set(false)
        promise.reject("BAD_ARGS", "Pick at least one platform with URL + stream key", null)
        return@AsyncFunction
      }
      if (endpoints.size > 3) {
        LiveBridge.starting.set(false)
        promise.reject("BAD_ARGS", "At most 3 platforms at once", null)
        return@AsyncFunction
      }

      val activity = appContext.currentActivity
      if (activity == null) {
        LiveBridge.starting.set(false)
        promise.reject("NO_ACTIVITY", "Open the app and try again", null)
        return@AsyncFunction
      }
      LiveBridge.pendingEndpoints = endpoints
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

    AsyncFunction("pause") { promise: Promise ->
      if (!LiveBridge.live.get()) {
        promise.resolve(null)
        return@AsyncFunction
      }
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "App is not running", null)
        return@AsyncFunction
      }
      context.startService(
        Intent(context, LiveStreamService::class.java).apply {
          action = LiveStreamService.ACTION_PAUSE
        },
      )
      promise.resolve(null)
    }

    AsyncFunction("resume") { promise: Promise ->
      if (!LiveBridge.live.get()) {
        promise.resolve(null)
        return@AsyncFunction
      }
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "App is not running", null)
        return@AsyncFunction
      }
      context.startService(
        Intent(context, LiveStreamService::class.java).apply {
          action = LiveStreamService.ACTION_RESUME
        },
      )
      promise.resolve(null)
    }
  }
}
