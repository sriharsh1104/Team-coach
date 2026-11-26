package com.teamcoach.routinealarms

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RoutineAlarmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RoutineAlarms")

    Function("canScheduleExactAlarms") {
      val context = appContext.reactContext ?: return@Function false
      AlarmScheduler.canScheduleExact(context)
    }

    Function("openExactAlarmSettings") {
      val context = appContext.reactContext ?: return@Function
      AlarmScheduler.openExactAlarmSettings(context)
    }

    AsyncFunction("scheduleAll") { items: List<Map<String, Any?>> ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val parsed = items.mapNotNull { row ->
        val id = row["id"] as? String ?: return@mapNotNull null
        val title = (row["title"] as? String) ?: "Routine"
        val hour = (row["hour"] as? Number)?.toInt() ?: return@mapNotNull null
        val minute = (row["minute"] as? Number)?.toInt() ?: return@mapNotNull null
        AlarmScheduler.Item(id, title, hour, minute)
      }
      AlarmScheduler.saveAndSchedule(context, parsed)
      true
    }

    AsyncFunction("cancelAll") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      AlarmScheduler.cancelAll(context)
      context.getSharedPreferences(AlarmScheduler.PREFS, android.content.Context.MODE_PRIVATE)
        .edit()
        .putString(AlarmScheduler.KEY_SCHEDULE, "[]")
        .apply()
      true
    }
  }
}
