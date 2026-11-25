package com.teamcoach.livestreamer

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * Invisible activity: mic + notification + overlay permission, then the
 * system screen-capture dialog. Overlay lets the LIVE bubble sit on Free Fire.
 */
class LiveCapturePermissionActivity : Activity() {
  private var settled = false
  private var askedOverlay = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (savedInstanceState != null) return
    val missing = ArrayList<String>()
    if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO)
      != PackageManager.PERMISSION_GRANTED
    ) {
      missing.add(android.Manifest.permission.RECORD_AUDIO)
    }
    // Optional until Face Cam is toggled on, but asking here avoids a dead
    // prompt while Free Fire is already on top of us.
    if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA)
      != PackageManager.PERMISSION_GRANTED
    ) {
      missing.add(android.Manifest.permission.CAMERA)
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
      maybeAskOverlayThenProjection()
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
    val micGranted =
      micIndex < 0 || grantResults.getOrNull(micIndex) == PackageManager.PERMISSION_GRANTED
    if (!micGranted) {
      settled = true
      LiveBridge.rejectStart(
        "MIC_DENIED",
        "Allow microphone access. Android uses it for your voice and in-game sound.",
      )
      finish()
      return
    }
    maybeAskOverlayThenProjection()
  }

  private fun maybeAskOverlayThenProjection() {
    if (Build.VERSION.SDK_INT >= 23 &&
      !Settings.canDrawOverlays(this) &&
      !askedOverlay
    ) {
      askedOverlay = true
      try {
        startActivityForResult(
          Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:$packageName"),
          ),
          REQ_OVERLAY,
        )
        return
      } catch (_: Exception) {
        // Continue without bubble — notification actions still work.
      }
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
    if (requestCode == REQ_OVERLAY) {
      // Overlay is optional — stream still starts; bubble only if granted.
      askProjection()
      return
    }
    if (requestCode != REQ_PROJECTION) return
    if (resultCode != RESULT_OK || data == null) {
      settled = true
      LiveBridge.rejectStart("CANCELLED", "Screen share cancelled")
      finish()
      return
    }
    val endpoints = ArrayList(LiveBridge.pendingEndpoints)
    if (endpoints.isEmpty()) {
      settled = true
      LiveBridge.rejectStart("BAD_ARGS", "Missing stream URL")
      finish()
      return
    }
    settled = true
    val service = Intent(this, LiveStreamService::class.java).apply {
      action = LiveStreamService.ACTION_START
      putExtra(LiveStreamService.EXTRA_RESULT_CODE, resultCode)
      putExtra(LiveStreamService.EXTRA_DATA, data)
      putStringArrayListExtra(LiveStreamService.EXTRA_ENDPOINTS, endpoints)
      putExtra(LiveStreamService.EXTRA_BANNER, LiveBridge.pendingBanner)
    }
    ContextCompat.startForegroundService(this, service)
    finish()
  }

  override fun onDestroy() {
    if (!settled) {
      settled = true
      LiveBridge.rejectStart("CANCELLED", "Screen share cancelled")
    }
    super.onDestroy()
  }

  companion object {
    private const val REQ_PERMS = 5101
    private const val REQ_PROJECTION = 5102
    private const val REQ_OVERLAY = 5103
  }
}
