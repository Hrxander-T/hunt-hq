package app.hunthq.capture

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RectF
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import kotlin.math.abs
import kotlin.math.min

/** The look of the button: a pokeball. The centre button shrinks while pressed and the outline and centre flash green (sent) or red (failed). */
class BubbleView(ctx: Context) : View(ctx) {
    private val d = resources.displayMetrics.density
    private val red = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFE53935.toInt() }
    private val white = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
    private val black = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF202124.toInt() }
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 2.5f * d }
    private val dot = Paint(Paint.ANTI_ALIAS_FLAG)
    private val oval = RectF()
    private var tint: Int? = null

    var pressedLook = false
        set(value) { field = value; invalidate() }

    fun flash(color: Int) {
        tint = color
        invalidate()
        postDelayed({ tint = null; invalidate() }, 900)
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f
        val cy = height / 2f
        val r = min(width, height) / 2f - 2 * d
        val c = tint
        oval.set(cx - r, cy - r, cx + r, cy + r)
        canvas.drawArc(oval, 180f, 180f, true, red)   // top half
        canvas.drawArc(oval, 0f, 180f, true, white)   // bottom half
        canvas.drawRect(cx - r, cy - 0.1f * r, cx + r, cy + 0.1f * r, black)  // middle band
        ring.color = c ?: 0xFF202124.toInt()
        canvas.drawCircle(cx, cy, r - ring.strokeWidth / 2, ring)
        canvas.drawCircle(cx, cy, r * 0.32f, black)
        dot.color = c ?: Color.WHITE
        canvas.drawCircle(cx, cy, r * if (pressedLook) 0.14f else 0.21f, dot)
    }
}

/**
 * The floating button over the game. Tap = capture. Drag = move; on release it snaps to the nearest side edge
 * and remembers the place. Faded while idle so it does not cover the game.
 * All calls must come from the main thread.
 */
class Bubble(
    private val ctx: Context,
    private val screen: () -> Pair<Int, Int>,
    private val onTap: () -> Unit,
) {
    private companion object {
        const val IDLE_ALPHA = 0.55f
        const val KEY_RIGHT = "bubble_right"
        const val KEY_Y = "bubble_y"
    }

    private val wm = ctx.getSystemService(WindowManager::class.java)
    private val prefs = ctx.getSharedPreferences("hunt", Context.MODE_PRIVATE)
    private val d = ctx.resources.displayMetrics.density
    private val size = (46 * d).toInt()
    private val view = BubbleView(ctx)
    private var attached = false
    private val lp = WindowManager.LayoutParams(
        size, size,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        PixelFormat.TRANSLUCENT
    ).apply {
        gravity = Gravity.TOP or Gravity.START
        layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
    }

    fun attach() {
        place()
        view.alpha = IDLE_ALPHA
        view.setOnTouchListener(touch())
        wm.addView(view, lp)
        attached = true
    }

    fun detach() {
        if (!attached) return
        try { wm.removeView(view) } catch (e: Exception) { }
        attached = false
    }

    fun hide() { view.visibility = View.INVISIBLE }
    fun show() { view.visibility = View.VISIBLE }
    fun flash(color: Int) = view.flash(color)

    /** After a rotation: put the button back on its side and height for the new screen size. */
    fun keepOnScreen() {
        if (!attached) return
        place()
        wm.updateViewLayout(view, lp)
    }

    private fun place() {
        val (sw, sh) = screen()
        val right = prefs.getBoolean(KEY_RIGHT, true)
        val fy = prefs.getFloat(KEY_Y, 0.35f)
        lp.x = if (right) sw - size else 0
        lp.y = (fy * (sh - size)).toInt().coerceAtLeast(0)
    }

    private fun snap() {
        val (sw, sh) = screen()
        val right = lp.x + size / 2 > sw / 2
        val y = lp.y.coerceIn(0, (sh - size).coerceAtLeast(0))
        prefs.edit().putBoolean(KEY_RIGHT, right).putFloat(KEY_Y, y / (sh - size).coerceAtLeast(1).toFloat()).apply()
        lp.y = y
        val from = lp.x
        val to = if (right) sw - size else 0
        ValueAnimator.ofInt(from, to).apply {
            duration = 160
            addUpdateListener {
                lp.x = it.animatedValue as Int
                if (attached) wm.updateViewLayout(view, lp)
            }
        }.start()
    }

    private fun touch(): View.OnTouchListener {
        var downX = 0f; var downY = 0f; var startX = 0; var startY = 0; var moved = false
        return View.OnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX; downY = e.rawY; startX = lp.x; startY = lp.y; moved = false
                    view.pressedLook = true
                    view.animate().cancel()
                    view.alpha = 1f
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX
                    val dy = e.rawY - downY
                    if (moved || abs(dx) > 10 * d || abs(dy) > 10 * d) {
                        moved = true
                        lp.x = (startX + dx).toInt()
                        lp.y = (startY + dy).toInt()
                        wm.updateViewLayout(view, lp)
                    }
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    view.pressedLook = false
                    view.animate().alpha(IDLE_ALPHA).setStartDelay(1200).setDuration(300).start()
                    if (moved) snap() else if (e.action == MotionEvent.ACTION_UP) onTap()
                }
            }
            true
        }
    }
}
