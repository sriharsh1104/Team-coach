package com.teamcoach.livestreamer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.hardware.display.DisplayManager
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.DisplayMetrics
import android.util.Log
import android.view.Display
import android.view.Surface
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import com.pedro.common.AudioCodec
import com.pedro.common.ConnectChecker
import com.pedro.common.VideoCodec
// `object` is a Kotlin keyword — the package segment needs escaping.
import com.pedro.encoder.input.gl.render.filters.`object`.ImageObjectFilterRender
import com.pedro.encoder.input.sources.OrientationForced
import com.pedro.encoder.input.sources.audio.AudioSource
import com.pedro.encoder.input.sources.audio.MicrophoneSource
import com.pedro.encoder.input.sources.audio.MixAudioSource
import com.pedro.encoder.input.sources.video.NoVideoSource
import com.pedro.encoder.input.sources.video.ScreenSource
import com.pedro.encoder.utils.gl.AspectRatioMode
import com.pedro.encoder.utils.gl.TranslateTo
import com.pedro.library.base.StreamBase
import com.pedro.library.generic.GenericStream
import com.pedro.library.multiple.MultiStream
import com.pedro.library.multiple.MultiType
import com.pedro.library.util.streamclient.GenericStreamClient
import com.pedro.library.util.streamclient.RtmpStreamClient
import com.pedro.library.view.GlStreamInterface
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Foreground live stream: screen (MediaProjection) + mic mixed with game/
 * media playback audio → one or more RTMP(S) / SRT ingest endpoints
 * (YouTube / Twitch / Kick, alone or together). Kick may use srt://.
 */
class LiveStreamService : Service() {
  private data class LiveEndpoint(val url: String, val type: MultiType, val typeIndex: Int)

  private val main = Handler(Looper.getMainLooper())
  private var projection: MediaProjection? = null
  private var stream: StreamBase? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val stopping = AtomicBoolean(false)
  /** Kept so display-rotation changes can be pushed into the GL layer. */
  private var glInterface: GlStreamInterface? = null
  private var displayListener: DisplayManager.DisplayListener? = null
  private val lastPortrait = AtomicBoolean(true)
  private val videoBitrateBeforePause = AtomicInteger(2_500_000)
  /** "Be right back" image the streamer picked — drawn over the game while paused. */
  private var bannerUri: String? = null
  private var brbFilter: ImageObjectFilterRender? = null
  private var endpoints: List<String> = emptyList()
  private var liveEndpoints: List<LiveEndpoint> = emptyList()
  private val successCount = AtomicInteger(0)
  private val failCount = AtomicInteger(0)
  private var totalTargets = 1

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
      ACTION_MUTE -> setMuted(intent.getBooleanExtra(EXTRA_MUTED, false))
      ACTION_START -> startLive(intent)
    }
    return START_NOT_STICKY
  }

  private fun pauseLive() {
    val s = stream ?: return
    try {
      setAudioMuted(s, true)
      // Viewers must see the "be right back" card, not a frozen game — the
      // in-app overlay can never cover the game, only the encoder can.
      val showingBrb = showBreakScreen()
      try {
        videoBitrateBeforePause.set(VIDEO_BITRATE)
        // A still card needs a few hundred kbps to look clean; a blind
        // 50 kbps makes the banner arrive as blocks.
        s.setVideoBitrateOnFly(if (showingBrb) 400_000 else 50_000)
      } catch (_: Exception) {
      }
      if (showingBrb) bumpKeyframes()
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

  /**
   * Mute on its own, separate from pause: a streamer often wants to kill the
   * mic for a moment without dropping the video to a 50 kbps slideshow.
   * Pause still mutes too, so this only tracks the explicit toggle.
   */
  private fun setMuted(muted: Boolean) {
    val s = stream ?: return
    try {
      setAudioMuted(s, muted)
      LiveBridge.muted.set(muted)
      LiveBridge.emitMuted(muted)
    } catch (err: Exception) {
      Log.w(TAG, "mute failed", err)
    }
  }

  private fun resumeLive() {
    val s = stream ?: return
    try {
      // Resuming must not un-mute someone who muted on purpose first.
      setAudioMuted(s, LiveBridge.muted.get())
      hideBreakScreen()
      try {
        val bitrate = videoBitrateBeforePause.get().takeIf { it > 0 } ?: VIDEO_BITRATE
        s.setVideoBitrateOnFly(bitrate)
      } catch (_: Exception) {
      }
      bumpKeyframes()
      LiveBridge.paused.set(false)
      LiveBridge.emitPaused(false)
      val manager = getSystemService(NotificationManager::class.java)
      manager.notify(
        NOTIF_ID,
        buildNotification(
          "LIVE",
          liveNotifText(),
        ),
      )
    } catch (err: Exception) {
      Log.w(TAG, "resume failed", err)
    }
  }

  /**
   * Cover the encoded frame with the streamer's break card. The GL filter is
   * the only place this can happen: our React overlay draws inside the app,
   * and the thing being captured is whatever game is on top of it.
   *
   * @return true if the card is actually on screen now.
   */
  private fun showBreakScreen(): Boolean {
    val gl = glInterface ?: return false
    if (brbFilter != null) return true
    val card = buildBreakCard() ?: return false
    return try {
      val filter = ImageObjectFilterRender()
      // setFilter first, then feed it — the render is attached to the GL
      // thread by setFilter and loads its texture on the next draw.
      gl.setFilter(filter)
      filter.setImage(card)
      filter.setScale(100f, 100f)
      filter.setPosition(TranslateTo.CENTER)
      filter.setAlpha(1f)
      brbFilter = filter
      true
    } catch (err: Exception) {
      Log.w(TAG, "break screen failed", err)
      brbFilter = null
      false
    }
  }

  private fun hideBreakScreen() {
    val filter = brbFilter ?: return
    brbFilter = null
    try {
      // clearFilters releases the render on the GL thread; releasing it here
      // would touch GL from the wrong thread.
      glInterface?.clearFilters() ?: filter.release()
    } catch (err: Exception) {
      Log.w(TAG, "clear break screen failed", err)
    }
  }

  /**
   * The chosen banner letterboxed onto a full encoder-sized frame, so the
   * 100%-scale filter never stretches it. No banner picked → a plain
   * "Be right back" card, which still beats showing the live game.
   */
  private fun buildBreakCard(): Bitmap? {
    val size = outputSize()
    val card = try {
      Bitmap.createBitmap(size.width, size.height, Bitmap.Config.ARGB_8888)
    } catch (err: OutOfMemoryError) {
      Log.w(TAG, "break card alloc failed", err)
      return null
    }
    val canvas = Canvas(card)
    canvas.drawColor(Color.BLACK)

    val banner = decodeBanner(size.width, size.height)
    if (banner != null) {
      val scale = minOf(
        size.width.toFloat() / banner.width.toFloat(),
        size.height.toFloat() / banner.height.toFloat(),
      )
      val w = banner.width * scale
      val h = banner.height * scale
      val left = (size.width - w) / 2f
      val top = (size.height - h) / 2f
      canvas.drawBitmap(
        banner,
        Rect(0, 0, banner.width, banner.height),
        RectF(left, top, left + w, top + h),
        Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG),
      )
      banner.recycle()
      return card
    }

    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      textAlign = Paint.Align.CENTER
      textSize = size.height * 0.12f
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    canvas.drawText(
      "Be right back",
      size.width / 2f,
      size.height / 2f + paint.textSize / 3f,
      paint,
    )
    return card
  }

  /** Banner comes from the picker as file:// or content:// — both open here. */
  private fun decodeBanner(maxWidth: Int, maxHeight: Int): Bitmap? {
    val uri = bannerUri?.takeIf { it.isNotBlank() } ?: return null
    return try {
      val parsed = Uri.parse(uri)
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      contentResolver.openInputStream(parsed)?.use {
        BitmapFactory.decodeStream(it, null, bounds)
      }
      val opts = BitmapFactory.Options().apply {
        inSampleSize = sampleSizeFor(bounds.outWidth, bounds.outHeight, maxWidth, maxHeight)
      }
      contentResolver.openInputStream(parsed)?.use {
        BitmapFactory.decodeStream(it, null, opts)
      }
    } catch (err: Exception) {
      Log.w(TAG, "banner decode failed", err)
      null
    }
  }

  private fun sampleSizeFor(width: Int, height: Int, maxWidth: Int, maxHeight: Int): Int {
    if (width <= 0 || height <= 0) return 1
    var sample = 1
    while (width / (sample * 2) >= maxWidth && height / (sample * 2) >= maxHeight) {
      sample *= 2
    }
    return sample
  }

  private fun setAudioMuted(s: StreamBase, muted: Boolean) {
    when (val src = s.audioSource) {
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

  private fun makeChecker(index: Int): ConnectChecker {
    return object : ConnectChecker {
      override fun onConnectionStarted(url: String) {
        Log.i(TAG, "connecting[$index] $url")
      }

      override fun onConnectionSuccess() {
        val first = successCount.getAndIncrement() == 0
        Log.i(TAG, "connected[$index] (first=$first)")
        // YouTube needs an early IDR or Studio sits on “Starting…” with no preview.
        bumpKeyframes()
        if (first) {
          LiveBridge.resolveStart()
          val manager = getSystemService(NotificationManager::class.java)
          manager.notify(NOTIF_ID, buildNotification("LIVE", liveNotifText()))
        }
      }

      override fun onConnectionFailed(reason: String) {
        val fails = failCount.incrementAndGet()
        Log.e(TAG, "connection failed[$index]: $reason")
        val nice = friendlyIngestError(reason)
        // Keep going if at least one destination is up; only hard-fail when none connected.
        if (successCount.get() == 0 && fails >= totalTargets) {
          fail(nice)
        } else if (successCount.get() > 0) {
          LiveBridge.emitSoftError("One platform failed to connect: $nice")
        }
      }

      override fun onDisconnect() {
        if (!stopping.get() && successCount.get() <= 1 && totalTargets == 1) {
          stopLive("Disconnected")
        }
      }

      override fun onAuthError() {
        onConnectionFailed("Stream key rejected by the platform")
      }

      override fun onAuthSuccess() {}
    }
  }

  private fun liveNotifText(): String {
    val n = endpoints.size.coerceAtLeast(1)
    return if (n == 1) {
      "Streaming to your channel. Tap End to stop."
    } else {
      "Streaming to $n platforms. Tap End to stop."
    }
  }

  private fun prepareSources(proj: MediaProjection): Pair<ScreenSource, AudioSource> {
    val video = ScreenSource(applicationContext, proj)
    val audio: AudioSource = if (Build.VERSION.SDK_INT >= 29) {
      try {
        MixAudioSource(proj).also { it.microphoneVolume = 2f }
      } catch (err: Exception) {
        Log.w(TAG, "mix audio unavailable, mic only", err)
        MicrophoneSource()
      }
    } else {
      MicrophoneSource()
    }
    return video to audio
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
    val urls = intent.getStringArrayListExtra(EXTRA_ENDPOINTS)?.filter { it.isNotBlank() }
      ?: emptyList()
    if (data == null || urls.isEmpty()) {
      fail("Live stream could not start")
      return
    }
    endpoints = urls
    bannerUri = intent.getStringExtra(EXTRA_BANNER)?.takeIf { it.isNotBlank() }
    brbFilter = null
    liveEndpoints = emptyList()
    totalTargets = urls.size
    successCount.set(0)
    failCount.set(0)

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

    // Always publish a 16:9 landscape frame. Portrait phone screens are
    // letterboxed into it (AspectRatioMode.Adjust) so YouTube Studio's
    // landscape canvas fills instead of showing a tiny vertical strip.
    val size = outputSize()
    Log.i(TAG, "encoding ${size.width}x${size.height} (screen=${screenSize()})")
    try {
      if (urls.size == 1) {
        startSingle(urls[0], proj, size)
      } else {
        startMulti(urls, proj, size)
      }
    } catch (err: Exception) {
      Log.e(TAG, "stream setup failed", err)
      fail(err.message ?: "Could not prepare live encoder")
    }
  }

  private fun configureGl(gl: GlStreamInterface) {
    // Match encode FPS so YouTube keeps receiving frames even if the
    // screen is static (menus / pause screens).
    gl.setForceRender(true, VIDEO_FPS)
    // Fit the whole phone screen into the 16:9 encoder (black bars on the
    // sides when the phone is portrait). Fill would crop top/bottom.
    gl.setAspectRatioMode(AspectRatioMode.Adjust)
    // Kotlin maps get/setAutoHandleOrientation → property (calling the
    // Java setter by name is an unresolved reference).
    // Follow real display rotation so landscape games stay upright —
    // forcing LANDSCAPE previously double-rotated the capture.
    gl.autoHandleOrientation = true
    gl.forceOrientation(OrientationForced.NONE)
    val screen = screenSize()
    val portrait = screen.height > screen.width
    gl.setIsPortrait(portrait)
    gl.setStreamRotation(0)
    gl.setRotation(0)
    Log.i(
      TAG,
      "gl orient auto (portrait=$portrait display=${displayRotationDegrees()}° screen=${screen.width}x${screen.height})",
    )
    glInterface = gl
    lastPortrait.set(portrait)
    watchRotation()
  }

  /**
   * Orientation is read once when the stream starts — but the whole point of
   * Go Live is that the streamer then leaves the app and opens a landscape
   * game. Without following the display from here, the GL layer keeps the
   * start-time orientation and everything after the rotation arrives 90° out
   * (a landscape game rendered sideways inside a portrait frame).
   */
  private fun watchRotation() {
    if (displayListener != null) return
    val manager = getSystemService(DISPLAY_SERVICE) as? DisplayManager ?: return
    val listener = object : DisplayManager.DisplayListener {
      override fun onDisplayAdded(displayId: Int) = Unit
      override fun onDisplayRemoved(displayId: Int) = Unit
      override fun onDisplayChanged(displayId: Int) {
        if (displayId != Display.DEFAULT_DISPLAY) return
        applyRotation()
      }
    }
    displayListener = listener
    try {
      manager.registerDisplayListener(listener, main)
    } catch (err: Exception) {
      displayListener = null
      Log.w(TAG, "could not follow display rotation", err)
    }
  }

  private fun applyRotation() {
    val gl = glInterface ?: return
    val screen = screenSize()
    val portrait = screen.height > screen.width
    // compareAndSet also filters the repeat callbacks Android fires for
    // brightness / refresh-rate changes on the same display.
    if (!lastPortrait.compareAndSet(!portrait, portrait)) return
    try {
      gl.setIsPortrait(portrait)
      Log.i(TAG, "rotation → portrait=$portrait (${screen.width}x${screen.height})")
    } catch (err: Exception) {
      Log.w(TAG, "rotation update failed", err)
    }
  }

  private fun stopWatchingRotation() {
    val listener = displayListener ?: return
    displayListener = null
    glInterface = null
    try {
      (getSystemService(DISPLAY_SERVICE) as? DisplayManager)
        ?.unregisterDisplayListener(listener)
    } catch (err: Exception) {
      Log.w(TAG, "unregister display listener", err)
    }
  }

  private fun configureCodecs(s: StreamBase) {
    try {
      s.setVideoCodec(VideoCodec.H264)
      s.setAudioCodec(AudioCodec.AAC)
    } catch (err: Exception) {
      Log.w(TAG, "set codecs", err)
    }
  }

  /**
   * forceIncrementalTs helps YouTube; Kick/IVS often closes with
   * "EOF while 1 bytes expected" if it is forced on every RTMP destination.
   */
  private fun configureRtmpClient(client: Any?, endpointUrl: String) {
    val youtube =
      endpointUrl.contains("youtube", ignoreCase = true) ||
        endpointUrl.contains("rtmp.youtube", ignoreCase = true)
    when (client) {
      is GenericStreamClient -> {
        client.setReTries(15)
        if (youtube) client.forceIncrementalTs(true)
      }
      is RtmpStreamClient -> {
        client.setReTries(15)
        if (youtube) client.forceIncrementalTs(true)
      }
    }
  }

  private fun friendlyIngestError(reason: String): String {
    val r = reason.lowercase()
    return if (
      r.contains("eof") ||
      r.contains("1 bytes") ||
      r.contains("1 byte") ||
      r.contains("connection reset") ||
      r.contains("broken pipe")
    ) {
      "Server closed ingest (EOF) — re-copy Stream URL + Key from the dashboard. Kick URL must end with /app."
    } else {
      reason.ifBlank { "Connection to ingest failed" }
    }
  }

  private fun bumpKeyframes() {
    try {
      stream?.requestKeyframe()
    } catch (_: Exception) {
    }
    main.postDelayed({
      try {
        stream?.requestKeyframe()
      } catch (_: Exception) {
      }
    }, 800)
    main.postDelayed({
      try {
        stream?.requestKeyframe()
      } catch (_: Exception) {
      }
    }, 2500)
  }

  /** Current display rotation in degrees (0 / 90 / 180 / 270). */
  private fun displayRotationDegrees(): Int {
    val window = getSystemService(WINDOW_SERVICE) as WindowManager
    @Suppress("DEPRECATION")
    return when (window.defaultDisplay.rotation) {
      Surface.ROTATION_0 -> 0
      Surface.ROTATION_90 -> 90
      Surface.ROTATION_180 -> 180
      Surface.ROTATION_270 -> 270
      else -> 0
    }
  }

  private fun startSingle(url: String, proj: MediaProjection, size: Size) {
    val checker = makeChecker(0)
    val generic = GenericStream(applicationContext, checker, NoVideoSource(), MicrophoneSource())
    configureCodecs(generic)
    configureGl(generic.getGlInterface())
    configureRtmpClient(generic.getStreamClient(), url)
    val prepared = generic.prepareVideo(
      size.width,
      size.height,
      bitrate = VIDEO_BITRATE,
      fps = VIDEO_FPS,
      iFrameInterval = KEYFRAME_INTERVAL_SEC,
      rotation = 0,
    ) && generic.prepareAudio(
      sampleRate = AUDIO_SAMPLE_RATE,
      isStereo = true,
      bitrate = AUDIO_BITRATE,
      echoCanceler = true,
      noiseSuppressor = true,
    )
    if (!prepared) throw IllegalStateException("Encoder prepare failed")
    val (video, audio) = prepareSources(proj)
    generic.changeVideoSource(video)
    generic.changeAudioSource(audio)
    stream = generic
    try {
      Log.i(TAG, "startStream single $url")
      generic.startStream(url)
      bumpKeyframes()
    } catch (err: Exception) {
      Log.e(TAG, "startStream failed", err)
      fail(err.message ?: "Could not connect to ingest")
    }
  }

  private fun startMulti(urls: List<String>, proj: MediaProjection, size: Size) {
    // MultiStream indexes are per-protocol (RTMP slot 0 ≠ SRT slot 0).
    val rtmpUrls = ArrayList<String>()
    val srtUrls = ArrayList<String>()
    val rtmpCheckers = ArrayList<ConnectChecker>()
    val srtCheckers = ArrayList<ConnectChecker>()
    var global = 0
    for (url in urls) {
      if (url.startsWith("srt://", ignoreCase = true)) {
        srtCheckers.add(makeChecker(global++))
        srtUrls.add(url)
      } else {
        rtmpCheckers.add(makeChecker(global++))
        rtmpUrls.add(url)
      }
    }
    val multi = MultiStream(
      applicationContext,
      rtmpCheckers.takeIf { it.isNotEmpty() }?.toTypedArray(),
      null,
      srtCheckers.takeIf { it.isNotEmpty() }?.toTypedArray(),
      null,
      NoVideoSource(),
      MicrophoneSource(),
    )
    configureCodecs(multi)
    configureGl(multi.getGlInterface())
    val prepared = multi.prepareVideo(
      size.width,
      size.height,
      bitrate = VIDEO_BITRATE,
      fps = VIDEO_FPS,
      iFrameInterval = KEYFRAME_INTERVAL_SEC,
      rotation = 0,
    ) && multi.prepareAudio(
      sampleRate = AUDIO_SAMPLE_RATE,
      isStereo = true,
      bitrate = AUDIO_BITRATE,
      echoCanceler = true,
      noiseSuppressor = true,
    )
    if (!prepared) throw IllegalStateException("Encoder prepare failed")
    val (video, audio) = prepareSources(proj)
    multi.changeVideoSource(video)
    multi.changeAudioSource(audio)
    stream = multi
    liveEndpoints =
      rtmpUrls.mapIndexed { i, u -> LiveEndpoint(u, MultiType.RTMP, i) } +
        srtUrls.mapIndexed { i, u -> LiveEndpoint(u, MultiType.SRT, i) }
    liveEndpoints.forEach { ep ->
      try {
        if (ep.type == MultiType.RTMP) {
          configureRtmpClient(
            multi.getStreamClient(MultiType.RTMP, ep.typeIndex),
            ep.url,
          )
        } else {
          try {
            multi.getStreamClient(ep.type, ep.typeIndex).setReTries(15)
          } catch (_: Exception) {
          }
        }
        Log.i(TAG, "startStream ${ep.type}[${ep.typeIndex}] ${ep.url}")
        multi.startStream(ep.type, ep.typeIndex, ep.url)
      } catch (err: Exception) {
        Log.e(TAG, "startStream ${ep.type}[${ep.typeIndex}] failed", err)
        makeChecker(0).onConnectionFailed(err.message ?: "Could not connect")
      }
    }
    bumpKeyframes()
  }

  private fun stopAllClients(s: MultiStream) {
    val targets = liveEndpoints.ifEmpty {
      endpoints.mapIndexed { i, url ->
        val type =
          if (url.startsWith("srt://", ignoreCase = true)) MultiType.SRT else MultiType.RTMP
        LiveEndpoint(url, type, i)
      }
    }
    targets.forEach { ep ->
      try {
        s.stopStream(ep.type, ep.typeIndex)
      } catch (_: Exception) {
      }
    }
  }

  private fun stopLive(reason: String) {
    if (!stopping.compareAndSet(false, true)) return
    stopWatchingRotation()
    try {
      when (val s = stream) {
        is MultiStream -> stopAllClients(s)
        else -> s?.stopStream()
      }
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
    endpoints = emptyList()
    liveEndpoints = emptyList()
    bannerUri = null
    brbFilter = null
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
      when (val s = stream) {
        is MultiStream -> stopAllClients(s)
        else -> s?.stopStream()
      }
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
    endpoints = emptyList()
    liveEndpoints = emptyList()
    bannerUri = null
    brbFilter = null
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

  /** Current phone display size (for logs / future adaptive encoding). */
  private fun screenSize(): Size {
    val metrics = DisplayMetrics()
    val window = getSystemService(WINDOW_SERVICE) as WindowManager
    @Suppress("DEPRECATION")
    window.defaultDisplay.getRealMetrics(metrics)
    var width = metrics.widthPixels
    var height = metrics.heightPixels
    if (width % 2 != 0) width -= 1
    if (height % 2 != 0) height -= 1
    return Size(maxOf(2, width), maxOf(2, height))
  }

  /**
   * YouTube expects landscape. If the phone is already landscape (Free Fire
   * etc.), encode that aspect scaled to ≤1280 wide — matching capture avoids
   * the sideways / "teda" rotation. Portrait phones still get a 1280×720
   * canvas with letterboxing via [configureGl].
   */
  private fun outputSize(): Size {
    val screen = screenSize()
    if (screen.width >= screen.height) {
      var w = screen.width
      var h = screen.height
      if (w > OUTPUT_WIDTH) {
        val scale = OUTPUT_WIDTH.toFloat() / w.toFloat()
        w = OUTPUT_WIDTH
        h = (h.toFloat() * scale).toInt()
      }
      if (w % 2 != 0) w -= 1
      if (h % 2 != 0) h -= 1
      return Size(maxOf(2, w), maxOf(2, h))
    }
    return Size(OUTPUT_WIDTH, OUTPUT_HEIGHT)
  }

  companion object {
    const val ACTION_START = "com.teamcoach.livestreamer.START"
    const val ACTION_STOP = "com.teamcoach.livestreamer.STOP"
    const val ACTION_PAUSE = "com.teamcoach.livestreamer.PAUSE"
    const val ACTION_RESUME = "com.teamcoach.livestreamer.RESUME"
    const val ACTION_MUTE = "com.teamcoach.livestreamer.MUTE"
    const val EXTRA_MUTED = "muted"
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_DATA = "data"
    const val EXTRA_ENDPOINTS = "endpoints"
    const val EXTRA_BANNER = "banner"
    private const val NOTIF_ID = 4412
    private const val CHANNEL = "sacred-go-live"
    private const val TAG = "LiveStream"
    /**
     * Encode quality (shared by YouTube / Twitch / Kick).
     *
     * Kick max: 1920×1080 @ 60fps, ≤8000 kbps, H.264 CBR, keyframe 2s,
     * audio stereo ≤48 kHz. Phone-safe defaults below — raise carefully:
     * - 1080p: OUTPUT_WIDTH=1920, OUTPUT_HEIGHT=1080, VIDEO_BITRATE≈5_500_000
     * - 60fps: VIDEO_FPS=60, VIDEO_BITRATE≈5_000_000+ (needs strong upload)
     * Upload rule of thumb: ≥2× video bitrate (4.5 Mbps → ~9 Mbps up).
     */
    private const val OUTPUT_WIDTH = 1280
    private const val OUTPUT_HEIGHT = 720
    /** ~3 Mbps @ 720p30 — stable on typical Indian mobile upload; raise later. */
    private const val VIDEO_BITRATE = 3_000_000
    private const val VIDEO_FPS = 30
    private const val KEYFRAME_INTERVAL_SEC = 2
    private const val AUDIO_SAMPLE_RATE = 44_100
    private const val AUDIO_BITRATE = 128_000
  }
}
