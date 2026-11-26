package com.teamcoach.routinealarms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val id = intent?.getStringExtra(AlarmScheduler.EXTRA_ID) ?: return
    val title = intent.getStringExtra(AlarmScheduler.EXTRA_TITLE) ?: "Routine"

    val activity = Intent(context, AlarmActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      putExtra(AlarmScheduler.EXTRA_ID, id)
      putExtra(AlarmScheduler.EXTRA_TITLE, title)
    }
    context.startActivity(activity)

    // Re-arm for the next day from the cached schedule.
    val item = AlarmScheduler.loadItems(context).firstOrNull { it.id == id }
    if (item != null) {
      // cancelAll + scheduleOne is handled by rewriting the full schedule.
      AlarmScheduler.saveAndSchedule(context, AlarmScheduler.loadItems(context))
    }
  }
}
