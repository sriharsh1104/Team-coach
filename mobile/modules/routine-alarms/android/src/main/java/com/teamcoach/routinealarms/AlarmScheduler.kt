package com.teamcoach.routinealarms

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

object AlarmScheduler {
  const val PREFS = "routine_alarms"
  const val KEY_SCHEDULE = "schedule_json"
  const val EXTRA_ID = "routine_id"
  const val EXTRA_TITLE = "routine_title"
  const val ACTION_FIRE = "com.teamcoach.routinealarms.FIRE"

  data class Item(val id: String, val title: String, val hour: Int, val minute: Int)

  fun canScheduleExact(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return am.canScheduleExactAlarms()
  }

  fun openExactAlarmSettings(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
        data = android.net.Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }
  }

  fun saveAndSchedule(context: Context, items: List<Item>) {
    // Cancel using the *previous* schedule first — overwriting prefs before
    // cancel would leave orphaned PendingIntents for deleted routine ids.
    cancelAll(context)
    val arr = JSONArray()
    for (item in items) {
      arr.put(
        JSONObject()
          .put("id", item.id)
          .put("title", item.title)
          .put("hour", item.hour)
          .put("minute", item.minute),
      )
    }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_SCHEDULE, arr.toString())
      .apply()
    for (item in items) {
      scheduleOne(context, item)
    }
  }

  fun rescheduleFromPrefs(context: Context) {
    val items = loadItems(context)
    for (item in items) {
      cancelOne(context, item)
      scheduleOne(context, item)
    }
  }

  fun loadItems(context: Context): List<Item> {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getString(KEY_SCHEDULE, null) ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      val out = ArrayList<Item>(arr.length())
      for (i in 0 until arr.length()) {
        val o = arr.getJSONObject(i)
        out.add(
          Item(
            id = o.getString("id"),
            title = o.optString("title", "Routine"),
            hour = o.getInt("hour"),
            minute = o.getInt("minute"),
          ),
        )
      }
      out
    } catch (_: Exception) {
      emptyList()
    }
  }

  fun cancelAll(context: Context) {
    val items = loadItems(context)
    for (item in items) {
      cancelOne(context, item)
    }
  }

  fun cancelOne(context: Context, item: Item) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(pendingBroadcast(context, item.id, item.title))
    am.cancel(pendingActivity(context, item.id, item.title))
    am.cancel(pendingShow(context, item.id))
  }

  /** Re-arm the next daily occurrence after an alarm fires. */
  fun scheduleNextOccurrence(context: Context, id: String) {
    val item = loadItems(context).firstOrNull { it.id == id } ?: return
    cancelOne(context, item)
    scheduleOne(context, item)
  }

  fun scheduleOne(context: Context, item: Item) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val triggerAt = nextTriggerMillis(item.hour, item.minute)
    val firePi = pendingBroadcast(context, item.id, item.title)
    // showIntent is only for the status-bar clock chip — must NOT ring/re-arm.
    val showPi = pendingShow(context, item.id)
    try {
      // setAlarmClock is the most reliable wake path: status-bar clock icon,
      // exempt from Doze, and allowed to launch UI when the device is locked.
      am.setAlarmClock(AlarmManager.AlarmClockInfo(triggerAt, showPi), firePi)
    } catch (_: SecurityException) {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, firePi)
        } else {
          @Suppress("DEPRECATION")
          am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, firePi)
        }
      } catch (_: SecurityException) {
        // Exact alarm permission missing — JS falls back to notifications.
      }
    }
  }

  private fun nextTriggerMillis(hour: Int, minute: Int): Long {
    val cal = Calendar.getInstance().apply {
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
      set(Calendar.HOUR_OF_DAY, hour)
      set(Calendar.MINUTE, minute)
      if (timeInMillis <= System.currentTimeMillis() + 2_000L) {
        add(Calendar.DAY_OF_YEAR, 1)
      }
    }
    return cal.timeInMillis
  }

  private fun pendingBroadcast(context: Context, id: String, title: String): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java).apply {
      action = ACTION_FIRE
      putExtra(EXTRA_ID, id)
      putExtra(EXTRA_TITLE, title)
    }
    val requestCode = id.hashCode()
    val flags =
      PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    return PendingIntent.getBroadcast(context, requestCode, intent, flags)
  }

  fun pendingActivity(context: Context, id: String, title: String): PendingIntent {
    val intent = Intent(context, AlarmActivity::class.java).apply {
      action = ACTION_FIRE
      putExtra(EXTRA_ID, id)
      putExtra(EXTRA_TITLE, title)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    // Distinct request code from broadcast so both PendingIntents coexist.
    val requestCode = id.hashCode() xor 0x5A17
    val flags =
      PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    return PendingIntent.getActivity(context, requestCode, intent, flags)
  }

  private fun pendingShow(context: Context, id: String): PendingIntent {
    val launch =
      context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent().setPackage(context.packageName)
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val requestCode = id.hashCode() xor 0x51C0
    val flags =
      PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    return PendingIntent.getActivity(context, requestCode, launch, flags)
  }

  fun notificationId(id: String): Int = 71000 + (id.hashCode() and 0xFFFF)
}
