package com.teamcoach.screenrecorder

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * Invisible activity: mic permission (required for game-audio capture), then the
 * system screen-capture dialog. The whole display is requested so the game,
 * not just this app, is recorded.
 */
class CapturePermissionActivity : Activity() {
  private var settled = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (savedInstanceState != null) return
    val missing = ArrayList<String>()
    if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO)
      != PackageManager.PERMISSION_GRANTED
    ) {
      missing.add(android.Manifest.permission.RECORD_AUDIO)
    }
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
      != PackageManager.PERMISSION_GRANTED
    ) {
      missing.add(android.Manifest.permission.POST_NOTIFICATIONS)
    }
    if (missing.isNotEmpty()) {
      ActivityCompat.requestPermissions(this, missing.toTypedArray(), REQ_PERMS)
    } else {
      askProjection()
    }
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode != REQ_PERMS) return
    val micIndex = permissions.indexOf(android.Manifest.permission.RECORD_AUDIO)
    val micGranted = micIndex < 0 || grantResults.getOrNull(micIndex) == PackageManager.PERMISSION_GRANTED
    if (!micGranted) {
      // Playback capture also needs this permission. Video-only is not useful here.
      settled = true
      RecordBridge.rejectStart(
        "MIC_DENIED",
        "Allow microphone access. Android uses it to capture in-game sound.",
      )
      finish()
      return
    }
    askProjection()
  }

  private fun askProjection() {
    val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    val intent = if (Build.VERSION.SDK_INT >= 34) {
      manager.createScreenCaptureIntent(
        MediaProjectionConfig.createConfigForDefaultDisplay(),
      )
    } else {
      manager.createScreenCaptureIntent()
    }
    startActivityForResult(intent, REQ_PROJECTION)
  }

  @Deprecated("Activity result API")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != REQ_PROJECTION) return
    if (resultCode != RESULT_OK || data == null) {
      settled = true
      RecordBridge.rejectStart("CANCELLED", "Recording cancelled")
      finish()
      return
    }
    settled = true
    val service = Intent(this, ScreenRecordService::class.java).apply {
      action = ScreenRecordService.ACTION_START
      putExtra(ScreenRecordService.EXTRA_RESULT_CODE, resultCode)
      putExtra(ScreenRecordService.EXTRA_DATA, data)
    }
    ContextCompat.startForegroundService(this, service)
    finish()
  }

  override fun onDestroy() {
    if (!settled) {
      settled = true
      RecordBridge.rejectStart("CANCELLED", "Recording cancelled")
    }
    super.onDestroy()
  }

  companion object {
    private const val REQ_PERMS = 4101
    private const val REQ_PROJECTION = 4102
  }
}
