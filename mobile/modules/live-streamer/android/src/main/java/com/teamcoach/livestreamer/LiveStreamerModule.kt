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
     * destinationsJson: JSON array of { "url": "rtmp…|srt…", "key": "…" } (1–3 items).
     * Same screen capture is published to every destination at once.
     * RTMP(S): url + / + key. SRT (Kick/IVS): streamid in URL, or key → ?streamid=.
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
          val base = obj.optString("url", "").trim()
          val key = obj.optString("key", "").trim()
          val joined = joinIngestEndpoint(base, key)
          if (joined == null) {
            if (base.isNotEmpty()) {
              LiveBridge.starting.set(false)
              promise.reject(
                "BAD_ARGS",
                "URL must be rtmp(s):// or srt:// (SRT needs streamid in URL or a stream key)",
                null,
              )
              return@AsyncFunction
            }
            continue
          }
          endpoints.add(joined)
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

/**
 * Build the final ingest URL the encoder connects to.
 * - RTMP(S): `base/key`
 * - SRT: Kick/IVS style — `streamid` (and optional `passphrase`) live in the URL.
 *   If the dashboard URL already has `streamid=…`, use it as-is; otherwise append
 *   `?streamid=<key>` from the stream-key field.
 */
internal fun joinIngestEndpoint(baseRaw: String, keyRaw: String): String? {
  val base = baseRaw.trim().trimEnd('/')
  val key = keyRaw.trim()
  if (base.isEmpty()) return null
  return when {
    base.startsWith("srt://", ignoreCase = true) -> {
      if (Regex("""(?i)streamid=[^&]+""").containsMatchIn(base)) {
        base
      } else if (key.isNotEmpty()) {
        val sep = if (base.contains('?')) '&' else '?'
        "$base${sep}streamid=${android.net.Uri.encode(key)}"
      } else {
        null
      }
    }
    base.startsWith("rtmp://", ignoreCase = true) ||
      base.startsWith("rtmps://", ignoreCase = true) -> {
      if (key.isEmpty()) null else "$base/$key"
    }
    else -> null
  }
}
