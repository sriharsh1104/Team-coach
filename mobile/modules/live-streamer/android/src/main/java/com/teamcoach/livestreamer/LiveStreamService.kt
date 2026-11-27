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
import android.content.pm.PackageManager
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
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.pedro.common.AudioCodec
import com.pedro.common.ConnectChecker
import com.pedro.common.VideoCodec
// `object` is a Kotlin keyword — the package segment needs escaping.
import com.pedro.encoder.input.gl.render.filters.`object`.ImageObjectFilterRender
import com.pedro.encoder.input.gl.render.filters.`object`.SurfaceFilterRender
import com.pedro.encoder.input.sources.OrientationForced
import com.pedro.encoder.input.sources.audio.AudioSource
import com.pedro.encoder.input.sources.audio.MicrophoneSource
import com.pedro.encoder.input.sources.audio.MixAudioSource
import com.pedro.encoder.input.sources.video.NoVideoSource
import com.pedro.encoder.input.sources.video.ScreenSource
import com.pedro.encoder.input.video.Camera2ApiManager
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
  /** Kept for BRB / pause overlay filters. */
  private var glInterface: GlStreamInterface? = null
  private val videoBitrateBeforePause = AtomicInteger(DEFAULT_VIDEO_BITRATE_720)
  /** Active encode canvas — set from EXTRA_QUALITY at start. */
  @Volatile private var encodeWidth = DEFAULT_OUTPUT_WIDTH_720
  @Volatile private var encodeHeight = DEFAULT_OUTPUT_HEIGHT_720
  @Volatile private var encodeBitrate = DEFAULT_VIDEO_BITRATE_720
  /** "Be right back" image the streamer picked — drawn over the game while paused. */
  private var bannerUri: String? = null
  private var brbFilter: ImageObjectFilterRender? = null
  private var faceFilter: SurfaceFilterRender? = null
  private var faceCamera: Camera2ApiManager? = null
  /** User wants face cam on — re-attached after pause BRB clears filters. */
  private val faceCamWanted = AtomicBoolean(false)
  private var endpoints: List<String> = emptyList()
  private var liveEndpoints: List<LiveEndpoint> = emptyList()
  private val successCount = AtomicInteger(0)
  private val failCount = AtomicInteger(0)
  private var totalTargets = 1
  private var controlsBubble: LiveControlsBubble? = null

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
      ACTION_FACE_CAM -> setFaceCam(intent.getBooleanExtra(EXTRA_FACE_CAM, false))
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
        videoBitrateBeforePause.set(encodeBitrate)
        // A still card needs a few hundred kbps to look clean; a blind
        // 50 kbps makes the banner arrive as blocks.
        s.setVideoBitrateOnFly(if (showingBrb) 400_000 else 50_000)
      } catch (_: Exception) {
      }
      if (showingBrb) bumpKeyframes()
      LiveBridge.paused.set(true)
      LiveBridge.emitPaused(true)
      controlsBubble?.refresh()
      val manager = getSystemService(NotificationManager::class.java)
      manager.notify(
        NOTIF_ID,
        buildNotification("PAUSED", "Stream paused. Tap the LIVE bubble or notification."),
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
      controlsBubble?.refresh()
      val manager = getSystemService(NotificationManager::class.java)
      manager.notify(NOTIF_ID, buildNotification("LIVE", liveNotifText()))
    } catch (err: Exception) {
      Log.w(TAG, "mute failed", err)
    }
  }

  private fun toggleMuted() {
    setMuted(!LiveBridge.muted.get())
  }

  private fun toggleFaceCam() {
    setFaceCam(!faceCamWanted.get())
  }

  /**
   * Front-camera PiP on the encoded frame (YT/Twitch/Kick viewers see it).
   * Default off — streamer turns it on from the LIVE bubble / in-app widget.
   */
  private fun setFaceCam(enabled: Boolean) {
    faceCamWanted.set(enabled)
    if (!enabled) {
      detachFaceCam()
      LiveBridge.emitFaceCam(false)
      controlsBubble?.refresh()
      return
    }
    if (LiveBridge.paused.get()) {
      // Will attach when resume clears the BRB card.
      LiveBridge.emitFaceCam(true)
      controlsBubble?.refresh()
      return
    }
    if (!attachFaceCam()) {
      faceCamWanted.set(false)
      LiveBridge.emitFaceCam(false)
      LiveBridge.emitSoftError("Allow camera access to show your face on stream")
    } else {
      LiveBridge.emitFaceCam(true)
    }
    controlsBubble?.refresh()
  }

  private fun attachFaceCam(): Boolean {
    val gl = glInterface ?: return false
    if (faceFilter != null) return true
    if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA)
      != PackageManager.PERMISSION_GRANTED
    ) {
      return false
    }
    // Android 14+: camera frames stay black unless this FGS declares the
    // camera type while Camera2 is open.
    promoteForeground(withCamera = true)
    return try {
      val out = outputSize()
      val filter = SurfaceFilterRender { surfaceTexture ->
        try {
          val cam = Camera2ApiManager(applicationContext)
          // Prefer a modest front preview; fall back if the device rejects it.
          val opened = openFrontInto(cam, surfaceTexture, 640, 480)
            || openFrontInto(cam, surfaceTexture, 1280, 720)
            || openFrontInto(cam, surfaceTexture, out.width, out.height)
          if (!opened) throw IllegalStateException("no front camera resolution")
          faceCamera = cam
        } catch (err: Exception) {
          Log.e(TAG, "front camera open failed", err)
          main.post {
            faceCamWanted.set(false)
            detachFaceCam()
            LiveBridge.emitFaceCam(false)
            LiveBridge.emitSoftError("Could not open front camera")
            controlsBubble?.refresh()
          }
        }
      }
      // Match encoder canvas so the PiP texture isn't stretched/blank.
      filter.setDefaultScale(out.width, out.height)
      // Landscape encode: front sensor usually needs 270° to sit upright.
      filter.setRotation(270)
      // ~22% width × ~28% height keeps a near-4:3 face box on 16:9.
      filter.setScale(22f, 28f)
      filter.setPosition(TranslateTo.BOTTOM_RIGHT)
      gl.addFilter(filter)
      faceFilter = filter
      true
    } catch (err: Exception) {
      Log.e(TAG, "face cam filter failed", err)
      false
    }
  }

  private fun openFrontInto(
    cam: Camera2ApiManager,
    surfaceTexture: android.graphics.SurfaceTexture,
    width: Int,
    height: Int,
  ): Boolean {
    return try {
      cam.prepareCamera(surfaceTexture, width, height, VIDEO_FPS)
      cam.openCameraFront()
      true
    } catch (err: Exception) {
      Log.w(TAG, "front cam ${width}x$height failed", err)
      try {
        cam.closeCamera()
      } catch (_: Exception) {
      }
      false
    }
  }

  private fun detachFaceCam() {
    try {
      faceCamera?.closeCamera()
    } catch (_: Exception) {
    }
    faceCamera = null
    val filter = faceFilter
    faceFilter = null
    if (filter != null) {
      try {
        glInterface?.removeFilter(filter)
      } catch (_: Exception) {
      }
      try {
        filter.release()
      } catch (_: Exception) {
      }
    }
  }

  /** Keep MediaProjection (+ optional Camera) FGS types in sync with face cam. */
  private fun promoteForeground(withCamera: Boolean) {
    if (Build.VERSION.SDK_INT < 29) return
    val notification = buildNotification(
      if (LiveBridge.paused.get()) "LIVE paused" else "LIVE",
      liveNotifText(),
    )
    var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
    if (withCamera &&
      Build.VERSION.SDK_INT >= 30 &&
      ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA)
      == PackageManager.PERMISSION_GRANTED
    ) {
      types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
    }
    try {
      startForeground(NOTIF_ID, notification, types)
    } catch (err: Exception) {
      Log.w(TAG, "promoteForeground failed", err)
    }
  }

  private fun showControlsBubble() {
    main.post {
      if (controlsBubble == null) {
        controlsBubble = LiveControlsBubble(
          applicationContext,
          onPauseResume = {
            if (LiveBridge.paused.get()) resumeLive() else pauseLive()
          },
          onMuteToggle = { toggleMuted() },
          onFaceCamToggle = { toggleFaceCam() },
          onEnd = { stopLive("Ended from bubble") },
          isPaused = { LiveBridge.paused.get() },
          isMuted = { LiveBridge.muted.get() },
          isFaceCam = { faceCamWanted.get() },
        )
      }
      controlsBubble?.show()
    }
  }

  private fun hideControlsBubble() {
    main.post {
      controlsBubble?.hide()
      controlsBubble = null
    }
  }

  private fun resumeLive() {
    val s = stream ?: return
    try {
      // Resuming must not un-mute someone who muted on purpose first.
      setAudioMuted(s, LiveBridge.muted.get())
      hideBreakScreen()
      try {
        val bitrate = videoBitrateBeforePause.get().takeIf { it > 0 } ?: encodeBitrate
        s.setVideoBitrateOnFly(bitrate)
      } catch (_: Exception) {
      }
      bumpKeyframes()
      LiveBridge.paused.set(false)
      LiveBridge.emitPaused(false)
      controlsBubble?.refresh()
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
      // Drop face PiP while the full-frame BRB card is up.
      detachFaceCam()
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
    if (faceCamWanted.get()) {
      attachFaceCam()
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
          showControlsBubble()
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
    val where =
      if (n == 1) "Streaming to your channel."
      else "Streaming to $n platforms."
    val muted = if (LiveBridge.muted.get()) " Mic muted." else ""
    return "$where Use the LIVE bubble or Pause/Mute/End here.$muted"
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
      // Include camera type when already granted so Face Cam can open later
      // without black frames (Android 14+ FGS camera rules).
      promoteForeground(
        withCamera = ContextCompat.checkSelfPermission(
          this,
          android.Manifest.permission.CAMERA,
        ) == PackageManager.PERMISSION_GRANTED,
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
    applyQuality(intent.getStringExtra(EXTRA_QUALITY))
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

  /**
   * ScreenSource / MediaProjection already delivers upright pixels for the
   * current display rotation. Enabling autoHandleOrientation double-rotates
   * landscape games (Free Fire etc.) → sideways “teda” stream on YT/Twitch/Kick.
   * Always encode a fixed 16:9 landscape canvas; portrait UI letterboxes.
   */
  private fun configureGl(gl: GlStreamInterface) {
    gl.setForceRender(true, VIDEO_FPS)
    gl.setAspectRatioMode(AspectRatioMode.Adjust)
    gl.autoHandleOrientation = false
    gl.forceOrientation(OrientationForced.NONE)
    // Required for ScreenSource (pedroSG94/RootEncoder#1638 / #1841).
    gl.setCameraOrientation(0)
    gl.setIsPortrait(false)
    gl.setStreamRotation(0)
    gl.setRotation(0)
    Log.i(
      TAG,
      "gl screen-source (cameraOrient=0 auto=false) screen=${screenSize().width}x${screenSize().height}",
    )
    glInterface = gl
  }

  /** changeVideoSource() re-applies ScreenSource orientation — reset to 0. */
  private fun attachScreenSources(
    s: StreamBase,
    video: ScreenSource,
    audio: AudioSource,
  ) {
    s.changeVideoSource(video)
    s.changeAudioSource(audio)
    try {
      s.getGlInterface().setCameraOrientation(0)
      s.getGlInterface().setIsPortrait(false)
    } catch (err: Exception) {
      Log.w(TAG, "reset screen orientation after changeVideoSource", err)
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

  private fun startSingle(url: String, proj: MediaProjection, size: Size) {
    val checker = makeChecker(0)
    val generic = GenericStream(applicationContext, checker, NoVideoSource(), MicrophoneSource())
    configureCodecs(generic)
    configureGl(generic.getGlInterface())
    configureRtmpClient(generic.getStreamClient(), url)
    val prepared = generic.prepareVideo(
      size.width,
      size.height,
      bitrate = encodeBitrate,
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
    attachScreenSources(generic, video, audio)
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
      bitrate = encodeBitrate,
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
    attachScreenSources(multi, video, audio)
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
    hideControlsBubble()
    faceCamWanted.set(false)
    detachFaceCam()
    glInterface = null
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
    hideControlsBubble()
    faceCamWanted.set(false)
    detachFaceCam()
    glInterface = null
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
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    fun servicePending(action: String, requestCode: Int, extras: Intent.() -> Unit = {}): PendingIntent {
      val intent = Intent(this, LiveStreamService::class.java).apply {
        this.action = action
        extras()
      }
      return PendingIntent.getService(this, requestCode, intent, flags)
    }
    val paused = LiveBridge.paused.get()
    val muted = LiveBridge.muted.get()
    val pauseResume = if (paused) {
      servicePending(ACTION_RESUME, 1)
    } else {
      servicePending(ACTION_PAUSE, 1)
    }
    val muteToggle = servicePending(ACTION_MUTE, 2) {
      putExtra(EXTRA_MUTED, !muted)
    }
    val stopPending = servicePending(ACTION_STOP, 0)
    return NotificationCompat.Builder(this, CHANNEL)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(android.R.drawable.ic_menu_camera)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .addAction(0, if (paused) "Resume" else "Pause", pauseResume)
      .addAction(0, if (muted) "Unmute" else "Mute", muteToggle)
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
   * Always 16:9 landscape for YouTube / Twitch / Kick. MediaProjection
   * already rotates Free Fire etc. upright into this canvas; portrait app
   * UI is letterboxed (AspectRatioMode.Adjust).
   */
  private fun outputSize(): Size = Size(encodeWidth, encodeHeight)

  private fun applyQuality(raw: String?) {
    when (raw?.trim()?.lowercase()) {
      "1080", "1080p" -> {
        encodeWidth = DEFAULT_OUTPUT_WIDTH_1080
        encodeHeight = DEFAULT_OUTPUT_HEIGHT_1080
        encodeBitrate = DEFAULT_VIDEO_BITRATE_1080
      }
      else -> {
        encodeWidth = DEFAULT_OUTPUT_WIDTH_720
        encodeHeight = DEFAULT_OUTPUT_HEIGHT_720
        encodeBitrate = DEFAULT_VIDEO_BITRATE_720
      }
    }
    videoBitrateBeforePause.set(encodeBitrate)
    Log.i(TAG, "quality=${raw ?: "720"} → ${encodeWidth}x$encodeHeight @ ${encodeBitrate / 1000}kbps")
  }

  companion object {
    const val ACTION_START = "com.teamcoach.livestreamer.START"
    const val ACTION_STOP = "com.teamcoach.livestreamer.STOP"
    const val ACTION_PAUSE = "com.teamcoach.livestreamer.PAUSE"
    const val ACTION_RESUME = "com.teamcoach.livestreamer.RESUME"
    const val ACTION_MUTE = "com.teamcoach.livestreamer.MUTE"
    const val EXTRA_MUTED = "muted"
    const val ACTION_FACE_CAM = "com.teamcoach.livestreamer.FACE_CAM"
    const val EXTRA_FACE_CAM = "faceCam"
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_DATA = "data"
    const val EXTRA_ENDPOINTS = "endpoints"
    const val EXTRA_BANNER = "banner"
    const val EXTRA_QUALITY = "quality"
    private const val NOTIF_ID = 4412
    private const val CHANNEL = "sacred-go-live"
    private const val TAG = "LiveStream"
    /**
     * Encode quality (shared by YouTube / Twitch / Kick).
     *
     * Kick max: 1920×1080 @ 60fps, ≤8000 kbps, H.264 CBR, keyframe 2s.
     * Upload rule of thumb: ≥2× video bitrate (5.5 Mbps → ~11 Mbps up for 1080).
     */
    private const val DEFAULT_OUTPUT_WIDTH_720 = 1280
    private const val DEFAULT_OUTPUT_HEIGHT_720 = 720
    /** ~3 Mbps @ 720p30 — stable on typical Indian mobile upload. */
    private const val DEFAULT_VIDEO_BITRATE_720 = 3_000_000
    private const val DEFAULT_OUTPUT_WIDTH_1080 = 1920
    private const val DEFAULT_OUTPUT_HEIGHT_1080 = 1080
    /** ~5.5 Mbps @ 1080p30 — needs a strong upload. */
    private const val DEFAULT_VIDEO_BITRATE_1080 = 5_500_000
    private const val VIDEO_FPS = 30
    private const val KEYFRAME_INTERVAL_SEC = 2
    private const val AUDIO_SAMPLE_RATE = 44_100
    private const val AUDIO_BITRATE = 128_000
  }
}
