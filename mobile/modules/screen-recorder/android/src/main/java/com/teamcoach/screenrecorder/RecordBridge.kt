package com.teamcoach.screenrecorder

import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import java.util.concurrent.atomic.AtomicBoolean

/** Process-local callbacks between the permission activity, the service, and JS. */
internal object RecordBridge {
  private val main = Handler(Looper.getMainLooper())
  val recording = AtomicBoolean(false)
  val starting = AtomicBoolean(false)

  var startPromise: Promise? = null
  var stopPromise: Promise? = null
  var module: ScreenRecorderModule? = null

  fun resolveStart() {
    main.post {
      starting.set(false)
      startPromise?.resolve(null)
      startPromise = null
    }
  }

  fun rejectStart(code: String, message: String) {
    main.post {
      starting.set(false)
      recording.set(false)
      startPromise?.reject(code, message, null)
      startPromise = null
    }
  }

  fun deliverSaved(uri: String?) {
    main.post {
      recording.set(false)
      starting.set(false)
      module?.sendEvent("onStopped", mapOf("uri" to uri))
      stopPromise?.resolve(uri)
      stopPromise = null
    }
  }

  fun deliverFailed(message: String) {
    main.post {
      recording.set(false)
      starting.set(false)
      module?.sendEvent("onStopped", mapOf("uri" to null, "error" to message))
      stopPromise?.reject("RECORD_FAILED", message, null)
      stopPromise = null
      startPromise?.reject("RECORD_FAILED", message, null)
      startPromise = null
    }
  }
}
