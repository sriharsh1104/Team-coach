package com.teamcoach.routinealarms

import android.app.Activity
import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Full-screen alarm UI: rings until Dismiss or Mark Done.
 * Mark Done deep-links into the app so JS can complete the routine for today.
 */
class AlarmActivity : Activity() {
  private var player: MediaPlayer? = null
  private var ringtone: Ringtone? = null
  private var vibrator: Vibrator? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    volumeControlStream = AudioManager.STREAM_ALARM

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }
    @Suppress("DEPRECATION")
    window.addFlags(
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
        WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON,
    )

    val km = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      km.requestDismissKeyguard(this, null)
    }

    val id = intent.getStringExtra(AlarmScheduler.EXTRA_ID).orEmpty()
    val title = intent.getStringExtra(AlarmScheduler.EXTRA_TITLE) ?: "Routine"

    // Clear the full-screen notification once UI is visible.
    try {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.cancel(AlarmScheduler.notificationId(id))
    } catch (_: Exception) {
      // ignore
    }

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(48, 48, 48, 48)
      setBackgroundColor(0xFF0A0A0C.toInt())
    }
    val heading = TextView(this).apply {
      text = "Daily Routine"
      textSize = 16f
      setTextColor(0xFF9AA0A6.toInt())
      gravity = Gravity.CENTER
    }
    val titleView = TextView(this).apply {
      text = title
      textSize = 28f
      setTextColor(0xFFF2F3F5.toInt())
      gravity = Gravity.CENTER
      setPadding(0, 24, 0, 48)
    }
    val done = Button(this).apply {
      text = "Mark Done"
      setOnClickListener {
        stopAlarm()
        val deep = Intent(Intent.ACTION_VIEW, Uri.parse("teamcoach://tracker/routine-done?id=$id"))
        deep.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
          startActivity(deep)
        } catch (_: Exception) {
          // App may not be installed in this process context — still dismiss.
        }
        finish()
      }
    }
    val dismiss = Button(this).apply {
      text = "Dismiss"
      setOnClickListener {
        stopAlarm()
        finish()
      }
    }
    root.addView(heading)
    root.addView(titleView)
    root.addView(done)
    root.addView(dismiss)
    setContentView(root)

    ensureAlarmVolume()
    startAlarm()
  }

  private fun ensureAlarmVolume() {
    try {
      val am = getSystemService(AUDIO_SERVICE) as AudioManager
      val max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
      if (max <= 0) return
      val current = am.getStreamVolume(AudioManager.STREAM_ALARM)
      if (current == 0) {
        am.setStreamVolume(AudioManager.STREAM_ALARM, (max * 0.7f).toInt().coerceAtLeast(1), 0)
      }
    } catch (_: Exception) {
      // ignore
    }
  }

  private fun alarmUri(): Uri {
    return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
  }

  private fun startAlarm() {
    val uri = alarmUri()
    try {
      player = MediaPlayer().apply {
        setDataSource(this@AlarmActivity, uri)
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        isLooping = true
        setVolume(1f, 1f)
        prepare()
        start()
      }
    } catch (_: Exception) {
      player = null
      try {
        ringtone = RingtoneManager.getRingtone(this, uri)?.also { tone ->
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            tone.isLooping = true
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            tone.audioAttributes =
              AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
          }
          tone.play()
        }
      } catch (_: Exception) {
        ringtone = null
      }
    }

    vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val vm = getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager
      vm.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      getSystemService(VIBRATOR_SERVICE) as Vibrator
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator?.vibrate(
          VibrationEffect.createWaveform(longArrayOf(0, 600, 400, 600), 0),
        )
      } else {
        @Suppress("DEPRECATION")
        vibrator?.vibrate(longArrayOf(0, 600, 400, 600), 0)
      }
    } catch (_: Exception) {
      // ignore
    }
  }

  private fun stopAlarm() {
    try {
      player?.stop()
      player?.release()
    } catch (_: Exception) {
      // ignore
    }
    player = null
    try {
      ringtone?.stop()
    } catch (_: Exception) {
      // ignore
    }
    ringtone = null
    try {
      vibrator?.cancel()
    } catch (_: Exception) {
      // ignore
    }
  }

  override fun onDestroy() {
    stopAlarm()
    super.onDestroy()
  }
}
