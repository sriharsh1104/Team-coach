package com.teamcoach.livestreamer

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Tiny system overlay while Go Live is active — works over Free Fire etc.
 * Collapsed: red LIVE chip. Tap to expand Pause / Mute / Face / End, tap LIVE
 * again to collapse so it barely covers the game.
 */
class LiveControlsBubble(
  private val context: Context,
  private val onPauseResume: () -> Unit,
  private val onMuteToggle: () -> Unit,
  private val onFaceCamToggle: () -> Unit,
  private val onEnd: () -> Unit,
  private val isPaused: () -> Boolean,
  private val isMuted: () -> Boolean,
  private val isFaceCam: () -> Boolean,
) {
  private val windowManager =
    context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  private var root: LinearLayout? = null
  private var params: WindowManager.LayoutParams? = null
  private var expanded = false
  private var liveChip: TextView? = null
  private var pauseBtn: TextView? = null
  private var muteBtn: TextView? = null
  private var faceBtn: TextView? = null
  private var endBtn: TextView? = null

  private var touchStartX = 0f
  private var touchStartY = 0f
  private var paramStartX = 0
  private var paramStartY = 0
  private var moved = false

  fun show() {
    if (!Settings.canDrawOverlays(context)) return
    if (root != null) {
      refresh()
      return
    }
    val density = context.resources.displayMetrics.density
    val padH = (12 * density).toInt()
    val padV = (8 * density).toInt()
    val gap = (6 * density).toInt()

    val panel = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(padH, padV, padH, padV)
      background = roundedBg(0xE6111118.toInt(), (22 * density))
      elevation = 12 * density
    }

    val type = if (Build.VERSION.SDK_INT >= 26) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
    val lp = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = (12 * density).toInt()
      y = (96 * density).toInt()
    }

    liveChip = chip("● LIVE", 0xFFEF4444.toInt()).also { chipView ->
      chipView.setOnTouchListener { _, event ->
        when (event.actionMasked) {
          MotionEvent.ACTION_DOWN -> {
            touchStartX = event.rawX
            touchStartY = event.rawY
            paramStartX = lp.x
            paramStartY = lp.y
            moved = false
            true
          }
          MotionEvent.ACTION_MOVE -> {
            val dx = (event.rawX - touchStartX).toInt()
            val dy = (event.rawY - touchStartY).toInt()
            if (kotlin.math.abs(dx) > 8 || kotlin.math.abs(dy) > 8) moved = true
            lp.x = (paramStartX + dx).coerceAtLeast(0)
            lp.y = (paramStartY + dy).coerceAtLeast(0)
            try {
              windowManager.updateViewLayout(panel, lp)
            } catch (_: Exception) {
            }
            true
          }
          MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
            if (!moved) toggleExpanded()
            true
          }
          else -> false
        }
      }
      panel.addView(chipView)
    }

    pauseBtn = chip("Pause", Color.WHITE).also { btn ->
      btn.visibility = View.GONE
      btn.setOnClickListener {
        onPauseResume()
        refresh()
      }
      panel.addView(
        btn,
        LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.WRAP_CONTENT,
          LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { marginStart = gap },
      )
    }

    muteBtn = chip("Mute", Color.WHITE).also { btn ->
      btn.visibility = View.GONE
      btn.setOnClickListener {
        onMuteToggle()
        refresh()
      }
      panel.addView(
        btn,
        LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.WRAP_CONTENT,
          LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { marginStart = gap },
      )
    }

    faceBtn = chip("Face", Color.WHITE).also { btn ->
      btn.visibility = View.GONE
      btn.setOnClickListener {
        onFaceCamToggle()
        refresh()
      }
      panel.addView(
        btn,
        LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.WRAP_CONTENT,
          LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { marginStart = gap },
      )
    }

    endBtn = chip("End", 0xFFEF4444.toInt()).also { btn ->
      btn.visibility = View.GONE
      btn.setOnClickListener { onEnd() }
      panel.addView(
        btn,
        LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.WRAP_CONTENT,
          LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { marginStart = gap },
      )
    }

    try {
      windowManager.addView(panel, lp)
      root = panel
      params = lp
      refresh()
    } catch (_: Exception) {
      root = null
      params = null
    }
  }

  fun refresh() {
    val paused = isPaused()
    val muted = isMuted()
    val faceOn = isFaceCam()
    liveChip?.text = when {
      paused -> "● PAUSED"
      else -> "● LIVE"
    }
    liveChip?.setTextColor(if (paused) 0xFFF59E0B.toInt() else 0xFFEF4444.toInt())
    pauseBtn?.text = if (paused) "Resume" else "Pause"
    muteBtn?.text = if (muted) "Unmute" else "Mute"
    muteBtn?.setTextColor(if (muted) 0xFFF59E0B.toInt() else Color.WHITE)
    faceBtn?.text = if (faceOn) "Face off" else "Face"
    faceBtn?.setTextColor(if (faceOn) 0xFFF59E0B.toInt() else Color.WHITE)
    val vis = if (expanded) View.VISIBLE else View.GONE
    pauseBtn?.visibility = vis
    muteBtn?.visibility = vis
    faceBtn?.visibility = vis
    endBtn?.visibility = vis
  }

  fun hide() {
    val view = root ?: return
    try {
      windowManager.removeView(view)
    } catch (_: Exception) {
    }
    root = null
    params = null
    expanded = false
  }

  private fun toggleExpanded() {
    expanded = !expanded
    refresh()
  }

  private fun chip(label: String, color: Int): TextView {
    val density = context.resources.displayMetrics.density
    return TextView(context).apply {
      text = label
      setTextColor(color)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      typeface = android.graphics.Typeface.DEFAULT_BOLD
      setPadding((8 * density).toInt(), (4 * density).toInt(), (8 * density).toInt(), (4 * density).toInt())
      isClickable = true
      isFocusable = true
    }
  }

  private fun roundedBg(color: Int, radiusPx: Float): GradientDrawable {
    return GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      cornerRadius = radiusPx
      setColor(color)
      setStroke((1 * context.resources.displayMetrics.density).toInt(), 0x55FFFFFF)
    }
  }

  companion object {
    fun canDraw(context: Context): Boolean =
      Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(context)
  }
}
