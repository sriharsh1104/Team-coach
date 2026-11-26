package com.teamcoach.routinealarms

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
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
  private var vibrator: Vibrator? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
      )
    }
    val km = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      km.requestDismissKeyguard(this, null)
    }

    val id = intent.getStringExtra(AlarmScheduler.EXTRA_ID).orEmpty()
    val title = intent.getStringExtra(AlarmScheduler.EXTRA_TITLE) ?: "Routine"

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

    startAlarm()
  }

  private fun startAlarm() {
    try {
      val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
      player = MediaPlayer().apply {
        setDataSource(this@AlarmActivity, uri)
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        isLooping = true
        prepare()
        start()
      }
    } catch (_: Exception) {
      player = null
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
