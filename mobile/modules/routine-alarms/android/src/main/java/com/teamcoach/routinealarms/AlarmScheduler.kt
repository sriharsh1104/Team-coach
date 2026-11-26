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
      // Cancel then re-arm each known id so boot doesn't double-fire.
      val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      am.cancel(pending(context, item.id, item.title))
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
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    // Also cancel by scanning a reasonable request-code space from known ids.
    for (item in items) {
      am.cancel(pending(context, item.id, item.title))
    }
  }

  private fun scheduleOne(context: Context, item: Item) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val triggerAt = nextTriggerMillis(item.hour, item.minute)
    val pi = pending(context, item.id, item.title)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
      } else {
        am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi)
      }
    } catch (_: SecurityException) {
      // Exact alarm permission missing — JS falls back to notifications.
    }
  }

  private fun nextTriggerMillis(hour: Int, minute: Int): Long {
    val cal = Calendar.getInstance().apply {
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
      set(Calendar.HOUR_OF_DAY, hour)
      set(Calendar.MINUTE, minute)
      if (timeInMillis <= System.currentTimeMillis()) {
        add(Calendar.DAY_OF_YEAR, 1)
      }
    }
    return cal.timeInMillis
  }

  private fun pending(context: Context, id: String, title: String): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java).apply {
      action = "com.teamcoach.routinealarms.FIRE"
      putExtra(EXTRA_ID, id)
      putExtra(EXTRA_TITLE, title)
    }
    val requestCode = id.hashCode()
    val flags =
      PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    return PendingIntent.getBroadcast(context, requestCode, intent, flags)
  }
}
