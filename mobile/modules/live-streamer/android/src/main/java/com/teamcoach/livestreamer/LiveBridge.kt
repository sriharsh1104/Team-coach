package com.teamcoach.livestreamer

import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import java.util.concurrent.atomic.AtomicBoolean

/** Process-local callbacks between the permission activity, the service, and JS. */
internal object LiveBridge {
  private val main = Handler(Looper.getMainLooper())
  val live = AtomicBoolean(false)
  val starting = AtomicBoolean(false)
  val paused = AtomicBoolean(false)
  /** Mic + game audio muted, independently of pause. */
  val muted = AtomicBoolean(false)

  var startPromise: Promise? = null
  var stopPromise: Promise? = null
  var module: LiveStreamerModule? = null

  /** Pending RTMP endpoints assembled in the Expo module before the permission activity. */
  @Volatile
  var pendingEndpoints: ArrayList<String> = ArrayList()

  /** "Be right back" image, handed to the service so pause can broadcast it. */
  @Volatile
  var pendingBanner: String = ""

  fun resolveStart() {
    main.post {
      starting.set(false)
      live.set(true)
      paused.set(false)
      muted.set(false)
      startPromise?.resolve(null)
      startPromise = null
      module?.sendEvent("onStarted", emptyMap<String, Any?>())
    }
  }

  fun rejectStart(code: String, message: String) {
    main.post {
      starting.set(false)
      live.set(false)
      paused.set(false)
      pendingEndpoints = ArrayList()
      startPromise?.reject(code, message, null)
      startPromise = null
      module?.sendEvent("onError", mapOf("message" to message, "code" to code))
    }
  }

  fun deliverStopped() {
    main.post {
      live.set(false)
      starting.set(false)
      paused.set(false)
      pendingEndpoints = ArrayList()
      module?.sendEvent("onStopped", emptyMap<String, Any?>())
      stopPromise?.resolve(null)
      stopPromise = null
    }
  }

  fun deliverFailed(message: String) {
    main.post {
      live.set(false)
      starting.set(false)
      paused.set(false)
      pendingEndpoints = ArrayList()
      module?.sendEvent("onError", mapOf("message" to message))
      module?.sendEvent("onStopped", mapOf("error" to message))
      stopPromise?.reject("LIVE_FAILED", message, null)
      stopPromise = null
      startPromise?.reject("LIVE_FAILED", message, null)
      startPromise = null
    }
  }

  fun emitPaused(isPaused: Boolean) {
    main.post {
      module?.sendEvent("onPaused", mapOf("paused" to isPaused))
    }
  }

  fun emitMuted(isMuted: Boolean) {
    main.post {
      module?.sendEvent("onMuted", mapOf("muted" to isMuted))
    }
  }

  fun emitSoftError(message: String) {
    main.post {
      module?.sendEvent("onError", mapOf("message" to message))
    }
  }
}
