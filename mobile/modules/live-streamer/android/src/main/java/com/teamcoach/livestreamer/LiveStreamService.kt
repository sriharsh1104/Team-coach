package com.teamcoach.livestreamer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import com.pedro.common.ConnectChecker
import com.pedro.encoder.input.sources.audio.MicrophoneSource
import com.pedro.encoder.input.sources.audio.MixAudioSource
import com.pedro.encoder.input.sources.video.NoVideoSource
import com.pedro.encoder.input.sources.video.ScreenSource
import com.pedro.library.generic.GenericStream
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Foreground live stream: screen (MediaProjection) + mic mixed with game/
 * media playback audio → RTMP(S) ingest (YouTube / Twitch / Kick).
 *
 * Separate from ScreenRecordService — recording stays untouched.
 */
class LiveStreamService : Service(), ConnectChecker {
  private val main = Handler(Looper.getMainLooper())
  private var projection: MediaProjection? = null
  private var stream: GenericStream? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val stopping = AtomicBoolean(false)
  private val videoBitrateBeforePause = AtomicInteger(2_500_000)
  private var endpoint: String? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopLive("Stopped")
        return START_NOT_STICKY
      }
      ACTION_PAUSE -> {
        pauseLive()
        return START_NOT_STICKY
      }
      ACTION_RESUME -> {
        resumeLive()
        return START_NOT_STICKY
      }
      ACTION_START -> startLive(intent)
    }
    return START_NOT_STICKY
  }

  /** Mute outbound audio while keeping the RTMP session + screen capture up. */
  private fun pauseLive() {
    val s = stream ?: return
    try {
      setAudioMuted(s, true)
      // Soft-pause video: drop bitrate so the feed looks idle while PAUSED UI shows.
      try {
        videoBitrateBeforePause.set(2_500_000)
        s.setVideoBitrateOnFly(50_000)
      } catch (_: Exception) {
      }
      LiveBridge.paused.set(true)
      LiveBridge.emitPaused(true)
      val manager = getSystemService(NotificationManager::class.java)
      manager.notify(
        NOTIF_ID,
        buildNotification("PAUSED", "Stream paused. Tap Resume in the app."),
      )
    } catch (err: Exception) {
      Log.w(TAG, "pause failed", err)
    }
  }

  private fun resumeLive() {
    val s = stream ?: return
    try {
      setAudioMuted(s, false)
      try {
        val bitrate = videoBitrateBeforePause.get().takeIf { it > 0 } ?: 2_500_000
        s.setVideoBitrateOnFly(bitrate)
      } catch (_: Exception) {
      }
      LiveBridge.paused.set(false)
      LiveBridge.emitPaused(false)
      val manager = getSystemService(NotificationManager::class.java)
      manager.notify(
        NOTIF_ID,
        buildNotification("LIVE", "Streaming to your channel. Tap End to stop."),
      )
    } catch (err: Exception) {
      Log.w(TAG, "resume failed", err)
    }
  }

  private fun setAudioMuted(s: GenericStream, muted: Boolean) {
    when (val src = s.getAudioSource()) {
      is MixAudioSource -> {
        if (muted) {
          src.muteMicrophone()
          src.muteInternalAudio()
        } else {
          src.unMuteMicrophone()
          src.unMuteInternalAudio()
        }
      }
      is MicrophoneSource -> {
        if (muted) src.mute() else src.unMute()
      }
    }
  }

  private fun startLive(intent: Intent) {
    val notification = buildNotification("Go Live", "Streaming your screen. Tap End to stop.")
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(
        NOTIF_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
      )
    } else {
      startForeground(NOTIF_ID, notification)
    }

    val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
    val data = if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(EXTRA_DATA)
    }
    val url = intent.getStringExtra(EXTRA_ENDPOINT)
    if (data == null || url.isNullOrBlank()) {
      fail("Live stream could not start")
      return
    }
    endpoint = url

    val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    val proj = try {
      manager.getMediaProjection(resultCode, data)
    } catch (err: Exception) {
      Log.e(TAG, "getMediaProjection failed", err)
      null
    }
    if (proj == null) {
      fail("Could not start screen share")
      return
    }
    projection = proj
    proj.registerCallback(object : MediaProjection.Callback() {
      override fun onStop() {
        stopLive("Screen share ended")
      }
    }, main)

    val pm = getSystemService(POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Sacred:GoLive").also {
      it.setReferenceCounted(false)
      it.acquire(14_400_000L) // 4 hours
    }

    val size = captureSize()
    val generic = try {
      GenericStream(applicationContext, this, NoVideoSource(), MicrophoneSource()).also { s ->
        s.getGlInterface().setForceRender(true, 15)
        val prepared = s.prepareVideo(
          size.width,
          size.height,
          bitrate = 2_500_000,
          fps = 30,
          iFrameInterval = 2,
          rotation = 0,
        ) && s.prepareAudio(
          sampleRate = 44_100,
          isStereo = true,
          bitrate = 128_000,
          echoCanceler = true,
          noiseSuppressor = true,
        )
        if (!prepared) {
          throw IllegalStateException("Encoder prepare failed")
        }
        s.changeVideoSource(ScreenSource(applicationContext, proj))
        if (Build.VERSION.SDK_INT >= 29) {
          try {
            val mix = MixAudioSource(proj)
            mix.microphoneVolume = 2f
            s.changeAudioSource(mix)
          } catch (err: Exception) {
            Log.w(TAG, "mix audio unavailable, mic only", err)
          }
        }
      }
    } catch (err: Exception) {
      Log.e(TAG, "stream setup failed", err)
      fail("Could not prepare live encoder")
      return
    }

    stream = generic
    try {
      generic.startStream(url)
    } catch (err: Exception) {
      Log.e(TAG, "startStream failed", err)
      fail(err.message ?: "Could not connect to ingest")
    }
  }

  private fun stopLive(reason: String) {
    if (!stopping.compareAndSet(false, true)) return
    try {
      stream?.stopStream()
    } catch (_: Exception) {
    }
    try {
      stream?.release()
    } catch (_: Exception) {
    }
    stream = null
    try {
      projection?.stop()
    } catch (_: Exception) {
    }
    projection = null
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    endpoint = null
    LiveBridge.deliverStopped()
    val manager = getSystemService(NotificationManager::class.java)
    manager.cancel(NOTIF_ID)
    if (Build.VERSION.SDK_INT >= 24) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
    Log.i(TAG, "stopped: $reason")
  }

  private fun fail(message: String) {
    stopping.set(true)
    try {
      stream?.stopStream()
    } catch (_: Exception) {
    }
    try {
      stream?.release()
    } catch (_: Exception) {
    }
    stream = null
    try {
      projection?.stop()
    } catch (_: Exception) {
    }
    projection = null
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    LiveBridge.deliverFailed(message)
    val manager = getSystemService(NotificationManager::class.java)
    manager.cancel(NOTIF_ID)
    if (Build.VERSION.SDK_INT >= 24) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  // ---- ConnectChecker ----

  override fun onConnectionStarted(url: String) {
    Log.i(TAG, "connecting $url")
  }

  override fun onConnectionSuccess() {
    LiveBridge.resolveStart()
    val manager = getSystemService(NotificationManager::class.java)
    manager.notify(
      NOTIF_ID,
      buildNotification("LIVE", "Streaming to your channel. Tap End to stop."),
    )
  }

  override fun onConnectionFailed(reason: String) {
    Log.e(TAG, "connection failed: $reason")
    fail(reason.ifBlank { "Connection to ingest failed" })
  }

  override fun onDisconnect() {
    if (!stopping.get()) {
      stopLive("Disconnected")
    }
  }

  override fun onAuthError() {
    fail("Stream key rejected by the platform")
  }

  override fun onAuthSuccess() {}

  private fun buildNotification(title: String, text: String): Notification {
    ensureChannel()
    val stopIntent = Intent(this, LiveStreamService::class.java).apply { action = ACTION_STOP }
    val stopPending = PendingIntent.getService(
      this,
      0,
      stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, CHANNEL)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(android.R.drawable.ic_menu_camera)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .addAction(0, "End", stopPending)
      .build()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(CHANNEL, "Go Live", NotificationManager.IMPORTANCE_LOW)
    manager.createNotificationChannel(channel)
  }

  private data class Size(val width: Int, val height: Int)

  private fun captureSize(): Size {
    val metrics = DisplayMetrics()
    val window = getSystemService(WINDOW_SERVICE) as WindowManager
    @Suppress("DEPRECATION")
    window.defaultDisplay.getRealMetrics(metrics)
    var width = metrics.widthPixels
    var height = metrics.heightPixels
    val longEdge = maxOf(width, height)
    val cap = 1280
    if (longEdge > cap) {
      val scale = cap.toFloat() / longEdge.toFloat()
      width = (width.toFloat() * scale).toInt()
      height = (height.toFloat() * scale).toInt()
    }
    if (width % 2 != 0) width -= 1
    if (height % 2 != 0) height -= 1
    return Size(maxOf(2, width), maxOf(2, height))
  }

  companion object {
    const val ACTION_START = "com.teamcoach.livestreamer.START"
    const val ACTION_STOP = "com.teamcoach.livestreamer.STOP"
    const val ACTION_PAUSE = "com.teamcoach.livestreamer.PAUSE"
    const val ACTION_RESUME = "com.teamcoach.livestreamer.RESUME"
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_DATA = "data"
    const val EXTRA_ENDPOINT = "endpoint"
    private const val NOTIF_ID = 4412
    private const val CHANNEL = "sacred-go-live"
    private const val TAG = "LiveStream"
  }
}
