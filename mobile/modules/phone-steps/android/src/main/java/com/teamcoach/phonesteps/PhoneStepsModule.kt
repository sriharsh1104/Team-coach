package com.teamcoach.phonesteps

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Calendar
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Reads the phone's hardware step counter (same sensor the system fitness
 * tile uses) — no Health Connect app picker. TYPE_STEP_COUNTER is cumulative
 * since reboot; we keep a per-day baseline in SharedPreferences.
 */
class PhoneStepsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PhoneSteps")

    Function("isAvailable") {
      val context = appContext.reactContext ?: return@Function false
      val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
      sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
    }

    AsyncFunction("getTodaySteps") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(null)
        return@AsyncFunction
      }
      val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
      val sensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
      if (sensor == null) {
        promise.resolve(null)
        return@AsyncFunction
      }

      val done = AtomicBoolean(false)
      val main = Handler(Looper.getMainLooper())
      val timeout =
        Runnable {
          if (done.compareAndSet(false, true)) {
            promise.resolve(null)
          }
        }

      val listener =
        object : SensorEventListener {
          override fun onSensorChanged(event: SensorEvent?) {
            if (event == null || event.sensor.type != Sensor.TYPE_STEP_COUNTER) return
            if (!done.compareAndSet(false, true)) return
            main.removeCallbacks(timeout)
            sm.unregisterListener(this)
            val cumulative = event.values[0].toLong().coerceAtLeast(0L)
            val today = stepsToday(context, cumulative)
            promise.resolve(today.toInt())
          }

          override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }

      main.postDelayed(timeout, 4_000L)
      val ok =
        sm.registerListener(
          listener,
          sensor,
          SensorManager.SENSOR_DELAY_NORMAL,
        )
      if (!ok) {
        main.removeCallbacks(timeout)
        if (done.compareAndSet(false, true)) {
          promise.resolve(null)
        }
      }
    }
  }

  private fun dayKey(): String {
    val c = Calendar.getInstance()
    val y = c.get(Calendar.YEAR)
    val m = c.get(Calendar.MONTH) + 1
    val d = c.get(Calendar.DAY_OF_MONTH)
    return "%04d-%02d-%02d".format(y, m, d)
  }

  private fun stepsToday(context: Context, cumulative: Long): Long {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val today = dayKey()
    val storedDay = prefs.getString(KEY_DAY, null)
    var baseline = prefs.getLong(KEY_BASELINE, -1L)

    // New day, or reboot reset the counter below our baseline.
    if (storedDay != today || baseline < 0L || cumulative < baseline) {
      baseline = cumulative
      prefs
        .edit()
        .putString(KEY_DAY, today)
        .putLong(KEY_BASELINE, baseline)
        .apply()
    }
    return (cumulative - baseline).coerceAtLeast(0L)
  }

  companion object {
    private const val PREFS = "phone_steps"
    private const val KEY_DAY = "day"
    private const val KEY_BASELINE = "baseline"
  }
}
