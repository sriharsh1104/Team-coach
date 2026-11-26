package com.teamcoach.routinealarms

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * Fires when AlarmManager triggers. Modern Android blocks background
 * startActivity — so we post a MAX-importance full-screen notification and
 * still attempt to open AlarmActivity for the loud ring UI.
 */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val id = intent?.getStringExtra(AlarmScheduler.EXTRA_ID) ?: return
    val title = intent.getStringExtra(AlarmScheduler.EXTRA_TITLE) ?: "Routine"

    val wakeLock =
      (context.getSystemService(Context.POWER_SERVICE) as PowerManager)
        .newWakeLock(
          PowerManager.PARTIAL_WAKE_LOCK,
          "teamcoach:routine_alarm",
        ).apply {
          setReferenceCounted(false)
          acquire(60_000L)
        }

    try {
      postFullScreenAlarm(context, id, title)

      val activity = Intent(context, AlarmActivity::class.java).apply {
        addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_CLEAR_TOP or
            Intent.FLAG_ACTIVITY_SINGLE_TOP,
        )
        putExtra(AlarmScheduler.EXTRA_ID, id)
        putExtra(AlarmScheduler.EXTRA_TITLE, title)
      }
      try {
        context.startActivity(activity)
      } catch (_: Exception) {
        // Full-screen notification still covers locked / background cases.
      }

      AlarmScheduler.scheduleNextOccurrence(context, id)
    } finally {
      try {
        if (wakeLock.isHeld) wakeLock.release()
      } catch (_: Exception) {
        // ignore
      }
    }
  }

  private fun postFullScreenAlarm(context: Context, id: String, title: String) {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    ensureChannel(context, nm)

    val fullScreen = AlarmScheduler.pendingActivity(context, id, title)
    val contentPi =
      PendingIntent.getActivity(
        context,
        id.hashCode() xor 0x11,
        Intent(context, AlarmActivity::class.java).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
          putExtra(AlarmScheduler.EXTRA_ID, id)
          putExtra(AlarmScheduler.EXTRA_TITLE, title)
        },
        PendingIntent.FLAG_UPDATE_CURRENT or
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0,
      )

    val alarmUri =
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

    val notification =
      NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
        .setContentTitle(title)
        .setContentText("Daily routine — tap to open alarm")
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setAutoCancel(true)
        .setSound(alarmUri)
        .setContentIntent(contentPi)
        .setFullScreenIntent(fullScreen, true)
        .build()

    nm.notify(AlarmScheduler.notificationId(id), notification)
  }

  private fun ensureChannel(context: Context, nm: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val alarmUri =
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
    val attrs =
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
    val channel =
      NotificationChannel(
        CHANNEL_ID,
        "Routine Alarms",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "Loud daily routine wake alarms"
        setSound(alarmUri, attrs)
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 600, 400, 600)
        setBypassDnd(true)
        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
      }
    nm.createNotificationChannel(channel)
  }

  companion object {
    const val CHANNEL_ID = "routine_alarms_v2"
  }
}
