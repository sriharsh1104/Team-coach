package com.teamcoach.screenrecorder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * Keeps an active voice channel alive while the app is in the background.
 *
 * Without a foreground service of type "microphone" Android (10+, strictly
 * from 14) silences mic capture and may freeze the app's sockets a little
 * after the user switches to their game. This service does no audio work
 * itself — it only holds the process foreground, shows the ongoing "In voice"
 * notification, and keeps the CPU awake so the WebRTC/socket traffic continues.
 */
class VoiceKeepAliveService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      shutDown()
      return START_NOT_STICKY
    }

    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "In voice"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Tap to return to the voice channel"
    val notification = buildNotification(title, text)
    try {
      if (Build.VERSION.SDK_INT >= 30) {
        startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      } else {
        startForeground(NOTIF_ID, notification)
      }
    } catch (_: Exception) {
      // Not allowed to start right now (e.g. mic permission missing). Voice
      // still works in the foreground; just don't crash the app.
      stopSelf()
      return START_NOT_STICKY
    }
    acquireWakeLock()
    // The session lives in the JS runtime; if the OS kills the process there
    // is nothing to resume, so do not ask to be restarted.
    return START_NOT_STICKY
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sacred:voice").apply {
      setReferenceCounted(false)
      // Safety net: never hold the CPU forever if JS forgets to stop us.
      acquire(MAX_MS)
    }
  }

  private fun shutDown() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    if (Build.VERSION.SDK_INT >= 24) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  override fun onDestroy() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    super.onDestroy()
  }

  private fun buildNotification(title: String, text: String): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) {
      val channel = NotificationChannel(CHANNEL, "Voice channel", NotificationManager.IMPORTANCE_LOW)
      channel.setShowBadge(false)
      manager.createNotificationChannel(channel)
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val open = launch?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
    return NotificationCompat.Builder(this, CHANNEL)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(android.R.drawable.stat_sys_phone_call)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setContentIntent(open)
      .build()
  }

  companion object {
    const val ACTION_START = "com.teamcoach.screenrecorder.VOICE_START"
    const val ACTION_STOP = "com.teamcoach.screenrecorder.VOICE_STOP"
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    private const val CHANNEL = "sacred-voice"
    private const val NOTIF_ID = 4108
    private const val MAX_MS = 6L * 60L * 60L * 1000L
  }
}
