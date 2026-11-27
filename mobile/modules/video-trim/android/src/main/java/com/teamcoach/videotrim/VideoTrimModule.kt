package com.teamcoach.videotrim

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import kotlin.concurrent.thread

/**
 * Lossless-ish clip trim via MediaExtractor + MediaMuxer (no FFmpeg).
 * Android starts at the nearest keyframe at/before `startMs`.
 */
class VideoTrimModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VideoTrim")

    Function("isAvailable") { true }

    AsyncFunction("trim") { uri: String, startMs: Double, endMs: Double, promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("E_NO_CONTEXT", "No Android context", null)
        return@AsyncFunction
      }
      thread(name = "video-trim") {
        try {
          val out = trimVideo(context, uri, startMs.toLong(), endMs.toLong())
          promise.resolve(
            mapOf(
              "uri" to Uri.fromFile(out).toString(),
              "durationMs" to (endMs - startMs).coerceAtLeast(0.0),
            ),
          )
        } catch (err: Exception) {
          promise.reject("E_TRIM", err.message ?: "Trim failed", err)
        }
      }
    }
  }
}

private fun trimVideo(context: Context, uriStr: String, startMs: Long, endMs: Long): File {
  require(endMs > startMs) { "endMs must be greater than startMs" }
  require(startMs >= 0) { "startMs must be >= 0" }

  val startUs = startMs * 1000L
  val endUs = endMs * 1000L

  val srcFile = materializeToCache(context, uriStr)
  val out =
    File(
      context.cacheDir,
      "trim-${System.currentTimeMillis()}.mp4",
    )

  val extractor = MediaExtractor()
  var muxer: MediaMuxer? = null
  try {
    extractor.setDataSource(srcFile.absolutePath)

    val rotation = readRotation(srcFile.absolutePath)
    muxer = MediaMuxer(out.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    if (rotation != 0) {
      try {
        muxer.setOrientationHint(rotation)
      } catch (_: Exception) {
      }
    }

    val trackMap = mutableMapOf<Int, Int>()
    for (i in 0 until extractor.trackCount) {
      val format = extractor.getTrackFormat(i)
      val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
      if (!mime.startsWith("video/") && !mime.startsWith("audio/")) continue
      trackMap[i] = muxer.addTrack(format)
    }
    if (trackMap.isEmpty()) {
      throw IllegalArgumentException("No audio/video tracks found")
    }

    muxer.start()
    val buffer = ByteBuffer.allocate(1024 * 1024)
    val info = MediaCodec.BufferInfo()

    for ((srcIndex, dstIndex) in trackMap) {
      extractor.selectTrack(srcIndex)
      // Nearest prior keyframe — required for passthrough muxing.
      extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)

      var firstPts = -1L
      while (true) {
        val size = extractor.readSampleData(buffer, 0)
        if (size < 0) break
        val pts = extractor.sampleTime
        if (pts > endUs) break
        if (pts < startUs && firstPts < 0) {
          // Still before requested start but after keyframe seek — keep it
          // so the GOP is complete; Android can't start mid-GOP.
        }
        if (firstPts < 0) firstPts = pts
        info.offset = 0
        info.size = size
        info.presentationTimeUs = (pts - firstPts).coerceAtLeast(0L)
        info.flags =
          if (extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) {
            MediaCodec.BUFFER_FLAG_KEY_FRAME
          } else {
            0
          }
        muxer.writeSampleData(dstIndex, buffer, info)
        if (!extractor.advance()) break
      }
      extractor.unselectTrack(srcIndex)
    }

    muxer.stop()
    return out
  } catch (err: Exception) {
    out.delete()
    throw err
  } finally {
    try {
      muxer?.release()
    } catch (_: Exception) {
    }
    extractor.release()
    // Temp materialization from content:// — drop when done.
    if (srcFile.name.startsWith("src-")) {
      srcFile.delete()
    }
  }
}

private fun readRotation(path: String): Int {
  val r = MediaMetadataRetriever()
  return try {
    r.setDataSource(path)
    r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
  } catch (_: Exception) {
    0
  } finally {
    try {
      r.release()
    } catch (_: Exception) {
    }
  }
}

/** Copy content:// / file:// into a real file the extractor can open. */
private fun materializeToCache(context: Context, uriStr: String): File {
  if (uriStr.startsWith("/") && File(uriStr).exists()) {
    return File(uriStr)
  }
  val uri = Uri.parse(uriStr)
  if (uri.scheme == "file") {
    val path = uri.path
    if (path != null && File(path).exists()) return File(path)
  }

  val out = File(context.cacheDir, "src-${System.currentTimeMillis()}.mp4")
  context.contentResolver.openInputStream(uri)?.use { input ->
    FileOutputStream(out).use { output -> input.copyTo(output) }
  } ?: throw IllegalArgumentException("Could not open video URI")
  return out
}
