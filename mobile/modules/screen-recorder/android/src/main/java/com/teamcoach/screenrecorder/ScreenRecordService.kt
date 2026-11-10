package com.teamcoach.screenrecorder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.MediaStore
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import java.io.File
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Records the device screen in the background, with game/media playback audio
 * mixed with the mic, and writes the mp4 into the phone gallery.
 *
 * Games that set allowAudioPlaybackCapture=false produce a silent game track.
 * That block is enforced by Android and cannot be bypassed by a normal app.
 */
class ScreenRecordService : Service() {
  private val main = Handler(Looper.getMainLooper())
  private var projection: MediaProjection? = null
  private var display: VirtualDisplay? = null
  private var videoRecorder: MediaRecorder? = null
  private var audio: GameAudioEncoder? = null
  private var videoFile: File? = null
  private var audioFile: File? = null
  private val stopping = AtomicBoolean(false)
  private var limitRunnable: Runnable? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopAndSave()
        return START_NOT_STICKY
      }
      ACTION_START -> startCapture(intent)
    }
    return START_NOT_STICKY
  }

  private fun startCapture(intent: Intent) {
    val notification = buildNotification("Recording", "Open your game. Tap Stop when you are done.")
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
    if (data == null) {
      fail("Screen capture was not allowed")
      return
    }

    val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    val proj = try {
      manager.getMediaProjection(resultCode, data)
    } catch (err: Exception) {
      Log.e(TAG, "getMediaProjection failed", err)
      null
    }
    if (proj == null) {
      fail("Could not start screen capture")
      return
    }
    projection = proj
    proj.registerCallback(object : MediaProjection.Callback() {
      override fun onStop() {
        stopAndSave()
      }
    }, main)

    val size = captureSize()
    val video = File(cacheDir, "sacred-screen-video.mp4")
    val audioOut = File(cacheDir, "sacred-screen-audio.m4a")
    video.delete()
    audioOut.delete()
    videoFile = video
    audioFile = audioOut

    val recorder = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(this) else MediaRecorder()
    try {
      recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE)
      recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264)
      recorder.setVideoSize(size.width, size.height)
      recorder.setVideoFrameRate(30)
      recorder.setVideoEncodingBitRate(4_000_000)
      recorder.setOutputFile(video.absolutePath)
      recorder.prepare()
    } catch (err: Exception) {
      Log.e(TAG, "MediaRecorder prepare failed", err)
      recorder.release()
      fail("This phone could not start screen recording")
      return
    }
    videoRecorder = recorder

    display = proj.createVirtualDisplay(
      "SacredGameRecord",
      size.width,
      size.height,
      size.dpi,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
      recorder.surface,
      null,
      null,
    )
    recorder.start()

    audio = if (Build.VERSION.SDK_INT >= 29) {
      GameAudioEncoder.tryStart(proj, audioOut)
    } else {
      null
    }

    RecordBridge.recording.set(true)
    stopping.set(false)
    RecordBridge.resolveStart()

    val limit = Runnable { stopAndSave() }
    limitRunnable = limit
    main.postDelayed(limit, MAX_MS)
  }

  private fun stopAndSave() {
    if (!stopping.compareAndSet(false, true)) return
    limitRunnable?.let { main.removeCallbacks(it) }
    Thread {
      val video = videoFile
      val audioOut = audioFile
      try {
        audio?.stop()
      } catch (err: Exception) {
        Log.w(TAG, "audio stop", err)
      }
      audio = null
      try {
        videoRecorder?.stop()
      } catch (err: Exception) {
        Log.w(TAG, "video stop", err)
      }
      try {
        display?.release()
      } catch (_: Exception) {
      }
      display = null
      try {
        videoRecorder?.release()
      } catch (_: Exception) {
      }
      videoRecorder = null
      try {
        projection?.stop()
      } catch (_: Exception) {
      }
      projection = null

      val finalFile = File(cacheDir, "sacred-screen-final.mp4")
      finalFile.delete()
      val muxed = if (video != null && video.length() > 0) {
        muxOrCopy(video, audioOut, finalFile)
      } else {
        null
      }
      video?.delete()
      audioOut?.delete()
      if (muxed == null || !muxed.exists() || muxed.length() == 0L) {
        muxed?.delete()
        main.post {
          fail("Nothing was recorded")
        }
        return@Thread
      }
      val uri = try {
        publishToGallery(muxed)
      } catch (err: Exception) {
        Log.e(TAG, "gallery save failed", err)
        null
      }
      muxed.delete()
      main.post {
        if (uri == null) {
          fail("Could not save the video on your phone")
        } else {
          showSaved()
          RecordBridge.deliverSaved(uri)
          stopSelf()
        }
      }
    }.start()
  }

  private fun showSaved() {
    val done = buildNotification("Saved on your phone", "The recording is in your gallery.")
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 24) {
      stopForeground(STOP_FOREGROUND_DETACH)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(false)
    }
    manager.notify(NOTIF_ID, done)
    main.postDelayed({ manager.cancel(NOTIF_ID) }, 4000)
  }

  private fun fail(message: String) {
    stopping.set(true)
    try {
      audio?.stop()
    } catch (_: Exception) {
    }
    audio = null
    try {
      display?.release()
    } catch (_: Exception) {
    }
    display = null
    try {
      videoRecorder?.release()
    } catch (_: Exception) {
    }
    videoRecorder = null
    try {
      projection?.stop()
    } catch (_: Exception) {
    }
    projection = null
    RecordBridge.deliverFailed(message)
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
      val scale = cap.toFloat() / longEdge
      width = (width * scale).toInt()
      height = (height * scale).toInt()
    }
    if (width % 2 != 0) width -= 1
    if (height % 2 != 0) height -= 1
    val dpi = if (metrics.densityDpi > 0) metrics.densityDpi else 320
    return Size(width.coerceAtLeast(2), height.coerceAtLeast(2), dpi)
  }

  private fun buildNotification(title: String, text: String): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) {
      val channel = NotificationChannel(CHANNEL, "Game recording", NotificationManager.IMPORTANCE_HIGH)
      manager.createNotificationChannel(channel)
    }
    val stop = PendingIntent.getService(
      this,
      0,
      Intent(this, ScreenRecordService::class.java).apply { action = ACTION_STOP },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, CHANNEL)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setOngoing(title == "Recording")
      .addAction(android.R.drawable.ic_media_pause, "Stop", stop)
      .build()
  }

  private fun publishToGallery(file: File): String {
    val values = android.content.ContentValues().apply {
      put(MediaStore.Video.Media.DISPLAY_NAME, "Sacred-${System.currentTimeMillis()}.mp4")
      put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
      if (Build.VERSION.SDK_INT >= 29) {
        put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/Sacred")
        put(MediaStore.Video.Media.IS_PENDING, 1)
      }
    }
    val uri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
      ?: throw IllegalStateException("MediaStore insert failed")
    contentResolver.openOutputStream(uri)?.use { out ->
      FileInputStream(file).use { input -> input.copyTo(out) }
    } ?: throw IllegalStateException("Could not open gallery file")
    if (Build.VERSION.SDK_INT >= 29) {
      values.clear()
      values.put(MediaStore.Video.Media.IS_PENDING, 0)
      contentResolver.update(uri, values, null, null)
    }
    return uri.toString()
  }

  private data class Size(val width: Int, val height: Int, val dpi: Int)

  companion object {
    const val ACTION_START = "com.teamcoach.screenrecorder.START"
    const val ACTION_STOP = "com.teamcoach.screenrecorder.STOP"
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_DATA = "data"
    private const val CHANNEL = "sacred-game-record"
    private const val NOTIF_ID = 4107
    private const val MAX_MS = 30L * 60L * 1000L
    private const val TAG = "ScreenRecord"
  }
}

private fun muxOrCopy(video: File, audio: File?, out: File): File {
  if (audio == null || audio.length() == 0L) {
    video.copyTo(out, overwrite = true)
    return out
  }
  val videoEx = MediaExtractor()
  val audioEx = MediaExtractor()
  var muxer: MediaMuxer? = null
  try {
    videoEx.setDataSource(video.absolutePath)
    audioEx.setDataSource(audio.absolutePath)
    val videoTrack = findTrack(videoEx, "video/")
    val audioTrack = findTrack(audioEx, "audio/")
    if (videoTrack < 0) {
      video.copyTo(out, overwrite = true)
      return out
    }
    muxer = MediaMuxer(out.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    videoEx.selectTrack(videoTrack)
    val videoIndex = muxer.addTrack(videoEx.getTrackFormat(videoTrack))
    val audioIndex = if (audioTrack >= 0) {
      audioEx.selectTrack(audioTrack)
      muxer.addTrack(audioEx.getTrackFormat(audioTrack))
    } else {
      -1
    }
    muxer.start()
    copySamples(videoEx, muxer, videoIndex)
    if (audioIndex >= 0) copySamples(audioEx, muxer, audioIndex)
    muxer.stop()
    return out
  } catch (err: Exception) {
    Log.w("ScreenRecord", "mux failed, saving video only", err)
    out.delete()
    video.copyTo(out, overwrite = true)
    return out
  } finally {
    try {
      muxer?.release()
    } catch (_: Exception) {
    }
    videoEx.release()
    audioEx.release()
  }
}

private fun findTrack(extractor: MediaExtractor, prefix: String): Int {
  for (i in 0 until extractor.trackCount) {
    val mime = extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME) ?: continue
    if (mime.startsWith(prefix)) return i
  }
  return -1
}

private fun copySamples(extractor: MediaExtractor, muxer: MediaMuxer, track: Int) {
  val buffer = ByteBuffer.allocate(1024 * 1024)
  val info = MediaCodec.BufferInfo()
  while (true) {
    val size = extractor.readSampleData(buffer, 0)
    if (size < 0) break
    info.offset = 0
    info.size = size
    info.presentationTimeUs = extractor.sampleTime
    val flags = extractor.sampleFlags
    info.flags = if (flags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) {
      MediaCodec.BUFFER_FLAG_KEY_FRAME
    } else {
      0
    }
    muxer.writeSampleData(track, buffer, info)
    extractor.advance()
  }
}

/**
 * Encodes game playback (and the mic, when it can be opened) to an m4a.
 * AudioPlaybackCapture only hears USAGE_GAME / USAGE_MEDIA / USAGE_UNKNOWN,
 * and only when the game allows capture.
 */
private class GameAudioEncoder(
  private val playback: AudioRecord,
  private var mic: AudioRecord?,
  private val codec: MediaCodec,
  private val muxer: MediaMuxer,
  private val file: File,
) {
  private val stopped = AtomicBoolean(false)
  private var thread: Thread? = null
  private var track = -1
  private var muxerStarted = false

  fun start() {
    playback.startRecording()
    try {
      mic?.startRecording()
    } catch (err: Exception) {
      Log.w("ScreenRecord", "mic start failed", err)
      try {
        mic?.release()
      } catch (_: Exception) {
      }
      mic = null
    }
    thread = Thread({ encode() }, "sacred-game-audio").also { it.start() }
  }

  fun stop() {
    stopped.set(true)
    try {
      playback.stop()
    } catch (_: Exception) {
    }
    try {
      mic?.stop()
    } catch (_: Exception) {
    }
    thread?.join(2500)
    try {
      playback.release()
    } catch (_: Exception) {
    }
    try {
      mic?.release()
    } catch (_: Exception) {
    }
    try {
      if (muxerStarted) muxer.stop()
    } catch (_: Exception) {
    }
    try {
      muxer.release()
    } catch (_: Exception) {
    }
    try {
      codec.release()
    } catch (_: Exception) {
    }
  }

  private fun encode() {
    val info = MediaCodec.BufferInfo()
    val bufferSize = playback.bufferSizeInFrames.coerceAtLeast(2048) * 2
    val game = ByteArray(bufferSize)
    val voice = ByteArray(bufferSize)
    var timeUs = 0L
    val sampleRate = 44100
    while (!stopped.get()) {
      val read = playback.read(game, 0, game.size)
      if (stopped.get() || read <= 0) break
      val voiceRead = mic?.read(voice, 0, read) ?: 0
      if (voiceRead > 0) mix(game, voice, minOf(read, voiceRead))
      val inIndex = codec.dequeueInputBuffer(10_000)
      if (inIndex >= 0) {
        val input = codec.getInputBuffer(inIndex)
        if (input != null) {
          input.clear()
          input.put(game, 0, read)
          codec.queueInputBuffer(inIndex, 0, read, timeUs, 0)
          timeUs += (read / 2) * 1_000_000L / sampleRate
        }
      }
      drain(info, false)
    }
    val eos = codec.dequeueInputBuffer(10_000)
    if (eos >= 0) {
      codec.queueInputBuffer(eos, 0, 0, timeUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
    }
    drain(info, true)
  }

  private fun drain(info: MediaCodec.BufferInfo, untilEos: Boolean) {
    var spins = 0
    while (true) {
      val outIndex = codec.dequeueOutputBuffer(info, if (untilEos) 10_000 else 0)
      if (outIndex == MediaCodec.INFO_TRY_AGAIN_LATER) {
        if (!untilEos) return
        spins += 1
        if (spins > 30) return
        continue
      }
      spins = 0
      if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
        if (!muxerStarted) {
          track = muxer.addTrack(codec.outputFormat)
          muxer.start()
          muxerStarted = true
        }
        continue
      }
      if (outIndex < 0) continue
      val output = codec.getOutputBuffer(outIndex)
      if (output != null && info.size > 0 && muxerStarted &&
        info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0
      ) {
        output.position(info.offset)
        output.limit(info.offset + info.size)
        muxer.writeSampleData(track, output, info)
      }
      codec.releaseOutputBuffer(outIndex, false)
      if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
    }
  }

  companion object {
    fun tryStart(projection: MediaProjection, file: File): GameAudioEncoder? {
      if (Build.VERSION.SDK_INT < 29) return null
      return try {
        val sampleRate = 44100
        val channel = AudioFormat.CHANNEL_IN_MONO
        val encoding = AudioFormat.ENCODING_PCM_16BIT
        val min = AudioRecord.getMinBufferSize(sampleRate, channel, encoding).coerceAtLeast(4096)
        val format = AudioFormat.Builder()
          .setEncoding(encoding)
          .setSampleRate(sampleRate)
          .setChannelMask(channel)
          .build()
        val config = AudioPlaybackCaptureConfiguration.Builder(projection)
          .addMatchingUsage(AudioAttributes.USAGE_GAME)
          .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
          .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
          .build()
        val playback = AudioRecord.Builder()
          .setAudioPlaybackCaptureConfig(config)
          .setAudioFormat(format)
          .setBufferSizeInBytes(min * 2)
          .build()
        val mic = try {
          AudioRecord.Builder()
            .setAudioSource(MediaRecorder.AudioSource.MIC)
            .setAudioFormat(format)
            .setBufferSizeInBytes(min * 2)
            .build()
        } catch (err: Exception) {
          Log.w("ScreenRecord", "mic unavailable", err)
          null
        }
        val codecFormat = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, 1)
        codecFormat.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
        codecFormat.setInteger(MediaFormat.KEY_BIT_RATE, 128000)
        codecFormat.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, min * 2)
        val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
        codec.configure(codecFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        codec.start()
        val muxer = MediaMuxer(file.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        GameAudioEncoder(playback, mic, codec, muxer, file).also { it.start() }
      } catch (err: Exception) {
        Log.w("ScreenRecord", "game audio unavailable", err)
        null
      }
    }
  }
}

private fun mix(game: ByteArray, voice: ByteArray, length: Int) {
  var i = 0
  while (i + 1 < length) {
    val g = ((game[i].toInt() and 0xff) or (game[i + 1].toInt() shl 8)).toShort().toInt()
    val v = ((voice[i].toInt() and 0xff) or (voice[i + 1].toInt() shl 8)).toShort().toInt()
    var mixed = g + (v * 0.65f).toInt()
    if (mixed > 32767) mixed = 32767
    if (mixed < -32768) mixed = -32768
    game[i] = (mixed and 0xff).toByte()
    game[i + 1] = ((mixed shr 8) and 0xff).toByte()
    i += 2
  }
}
