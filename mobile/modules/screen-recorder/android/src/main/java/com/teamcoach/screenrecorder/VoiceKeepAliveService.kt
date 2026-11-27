package com.teamcoach.screenrecorder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * Keeps an active voice channel alive while the app is in the background,
 * and shows the ongoing-call notification with Mute / Deafen / Leave quick
 * actions (same idea as WhatsApp's call notification) so the user doesn't
 * have to reopen the app for those.
 *
 * Without a foreground service of type "microphone" Android (10+, strictly
 * from 14) silences mic capture and may freeze the app's sockets a little
 * after the user switches to their game. This service does no audio work
 * itself — it only holds the process foreground, shows the notification,
 * keeps the CPU awake, and relays the three action-button taps to JS via
 * VoiceBridge. The actual mute/deafen/leave logic lives in JS (it owns the
 * WebRTC/socket session); this service only forwards the request.
 */
class VoiceKeepAliveService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        shutDown()
        return START_NOT_STICKY
      }
      ACTION_TOGGLE_MUTE -> {
        VoiceBridge.notifyAction("mute")
        return START_NOT_STICKY
      }
      ACTION_TOGGLE_DEAFEN -> {
        VoiceBridge.notifyAction("deafen")
        return START_NOT_STICKY
      }
      ACTION_LEAVE -> {
        // JS drives the actual leave (socket/WebRTC teardown) and calls
        // stopVoiceService itself once that's done — don't race it here.
        VoiceBridge.notifyAction("leave")
        return START_NOT_STICKY
      }
    }

    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "In voice"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Tap to return to the voice channel"
    val muted = intent?.getBooleanExtra(EXTRA_MUTED, false) ?: false
    val deafened = intent?.getBooleanExtra(EXTRA_DEAFENED, false) ?: false
    val room = intent?.getStringExtra(EXTRA_ROOM) ?: "team"
    val notification = buildNotification(title, text, muted, deafened, room)
    try {
      if (Build.VERSION.SDK_INT >= 30) {
        startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      } else {
        startForeground(NOTIF_ID, notification)
      }
    } catch (_: Exception) {
      // Android 14+ refuses a "microphone" foreground service in cases where
      // a plain one is still fine (started while the app is already in the
      // background, mic permission temporarily not "while-in-use", ...).
      // Giving up here was the difference between voice surviving the user
      // switching to their game and the OS freezing the process a few seconds
      // later — so fall back to an untyped foreground service, which still
      // holds the process and keeps the notification's buttons working.
      try {
        startForeground(NOTIF_ID, notification)
      } catch (_: Exception) {
        // Genuinely not allowed to go foreground at all. Voice still works
        // while the app is on screen; just don't crash the app.
        stopSelf()
        return START_NOT_STICKY
      }
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

  private fun actionPendingIntent(action: String, requestCode: Int): PendingIntent {
    return PendingIntent.getService(
      this,
      requestCode,
      Intent(this, VoiceKeepAliveService::class.java).apply { this.action = action },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun buildNotification(
    title: String,
    text: String,
    muted: Boolean,
    deafened: Boolean,
    room: String,
  ): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) {
      val channel = NotificationChannel(CHANNEL, "Voice channel", NotificationManager.IMPORTANCE_LOW)
      channel.setShowBadge(false)
      manager.createNotificationChannel(channel)
    }
    // Deep-link straight into the voice participant list (not chat / home).
    val voiceRoom = if (room == "guild") "guild" else "team"
    val openIntent = Intent(Intent.ACTION_VIEW, Uri.parse("teamcoach://voice/$voiceRoom")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      putExtra("type", "voice_keepalive")
      putExtra("voiceRoom", voiceRoom)
    }
    val open = PendingIntent.getActivity(
      this,
      0,
      openIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    // Not CATEGORY_CALL / phone icon: on several OEMs that combination
    // collapses the app the moment Join starts this foreground service.
    return NotificationCompat.Builder(this, CHANNEL)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentIntent(open)
      .addAction(
        if (muted) android.R.drawable.ic_btn_speak_now else android.R.drawable.ic_lock_silent_mode,
        if (muted) "Unmute" else "Mute",
        actionPendingIntent(ACTION_TOGGLE_MUTE, 1),
      )
      .addAction(
        android.R.drawable.ic_lock_silent_mode,
        if (deafened) "Undeafen" else "Deafen",
        actionPendingIntent(ACTION_TOGGLE_DEAFEN, 2),
      )
      .addAction(
        android.R.drawable.ic_menu_close_clear_cancel,
        "Leave",
        actionPendingIntent(ACTION_LEAVE, 3),
      )
      .build()
  }

  companion object {
    const val ACTION_START = "com.teamcoach.screenrecorder.VOICE_START"
    const val ACTION_STOP = "com.teamcoach.screenrecorder.VOICE_STOP"
    const val ACTION_TOGGLE_MUTE = "com.teamcoach.screenrecorder.VOICE_TOGGLE_MUTE"
    const val ACTION_TOGGLE_DEAFEN = "com.teamcoach.screenrecorder.VOICE_TOGGLE_DEAFEN"
    const val ACTION_LEAVE = "com.teamcoach.screenrecorder.VOICE_LEAVE"
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    const val EXTRA_MUTED = "muted"
    const val EXTRA_DEAFENED = "deafened"
    const val EXTRA_ROOM = "room"
    private const val CHANNEL = "sacred-voice"
    private const val NOTIF_ID = 4108
    private const val MAX_MS = 6L * 60L * 60L * 1000L
  }
}
