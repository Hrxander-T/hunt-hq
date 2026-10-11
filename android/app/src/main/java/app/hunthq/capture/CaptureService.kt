package app.hunthq.capture

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Point
import android.graphics.drawable.Icon
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.view.Display
import android.widget.RemoteViews
import android.widget.Toast
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Foreground service that keeps the screen-capture permission alive and owns the notification and the floating button.
 * It keeps the newest screen frame in memory; "Capture" saves that frame as a PNG in the app's private folder
 * and uploads it. Capture work runs on one background thread (`handler`), so no locks are needed.
 */
class CaptureService : Service() {

    companion object {
        const val ACTION_START = "app.hunthq.capture.START"
        const val ACTION_CAPTURE = "app.hunthq.capture.CAPTURE"
        const val ACTION_STOP = "app.hunthq.capture.STOP"
        const val EXTRA_CODE = "code"
        const val EXTRA_DATA = "data"
        private const val CHANNEL = "capture2"
        private const val NOTIF_ID = 1
        private val GREEN = Color.rgb(76, 217, 100)
        private val RED = Color.rgb(255, 69, 58)

        /** True while the service is running (used by the main screen to show its state). */
        @Volatile var running = false

        fun start(ctx: Context, resultCode: Int, data: Intent) {
            ctx.startForegroundService(
                Intent(ctx, CaptureService::class.java)
                    .setAction(ACTION_START)
                    .putExtra(EXTRA_CODE, resultCode)
                    .putExtra(EXTRA_DATA, data)
            )
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, CaptureService::class.java))
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private val net = Executors.newSingleThreadExecutor() // uploads run here, one at a time
    private lateinit var thread: HandlerThread
    private lateinit var handler: Handler

    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var latest: Image? = null
    private var width = 0
    private var height = 0
    private var dpi = 0
    private var bubble: Bubble? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        thread = HandlerThread("hunt-capture").also { it.start() }
        handler = Handler(thread.looper)
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Capture", NotificationManager.IMPORTANCE_DEFAULT).apply {
                setSound(null, null)
                enableVibration(false)
            }
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startCapturing(intent)
            ACTION_CAPTURE -> {
                if (projection == null) { stopSelf(); return START_NOT_STICKY }
                // Wait a moment: tapping the button closes the notification shade, and we don't want it in the picture.
                requestCapture(600)
            }
            ACTION_STOP -> stopSelf()
            else -> stopSelf() // restarted by the system without a permission token: nothing to do
        }
        return START_NOT_STICKY
    }

    private fun startCapturing(intent: Intent) {
        // Android 14+: the foreground service must be running (with the mediaProjection type) before we use the token.
        startForeground(NOTIF_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)

        val code = intent.getIntExtra(EXTRA_CODE, 0)
        val data = intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
        if (data == null) { stopSelf(); return }

        val mpm = getSystemService(MediaProjectionManager::class.java)
        val p = mpm.getMediaProjection(code, data)
        // Android 14+: a callback must be registered before creating the virtual display.
        p.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() { main.post { stopSelf() } }
        }, handler)
        projection = p

        val (w, h) = screenSize()
        width = w; height = h
        dpi = resources.displayMetrics.densityDpi
        val r = newReader(w, h)
        reader = r
        display = p.createVirtualDisplay(
            "hunt-capture", w, h, dpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, handler
        )
        running = true
        getSystemService(DisplayManager::class.java).registerDisplayListener(displayListener, handler)
        showBubble()
    }

    /** A reader that always keeps the newest frame; older frames are closed right away. */
    private fun newReader(w: Int, h: Int): ImageReader {
        val r = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 3)
        r.setOnImageAvailableListener({ rd ->
            val img = try { rd.acquireLatestImage() } catch (e: Exception) { null }
            if (img != null) { latest?.close(); latest = img }
        }, handler)
        return r
    }

    /** The real size of the screen right now (follows rotation; the app's window size can be out of date). */
    private fun screenSize(): Pair<Int, Int> {
        val d = getSystemService(DisplayManager::class.java).getDisplay(Display.DEFAULT_DISPLAY)
        val p = Point()
        @Suppress("DEPRECATION") d.getRealSize(p)
        return p.x to p.y
    }

    /** If the screen changed size (rotation), resize the capture to match. Returns true when it did. */
    private fun syncSize(): Boolean {
        val (w, h) = screenSize()
        if (w == width && h == height) return false
        resizeTo(w, h)
        return true
    }

    private val displayListener = object : DisplayManager.DisplayListener {
        override fun onDisplayAdded(displayId: Int) {}
        override fun onDisplayRemoved(displayId: Int) {}
        override fun onDisplayChanged(displayId: Int) {
            if (displayId != Display.DEFAULT_DISPLAY) return
            syncSize()
            main.post { bubble?.keepOnScreen() }
        }
    }

    private fun capture(alreadyResized: Boolean) {
        // If the phone was rotated since the last frame, resize the capture and try again after a fresh frame arrives.
        if (!alreadyResized && syncSize()) {
            handler.postDelayed({ capture(true) }, 700)
            return
        }
        val img = latest
        if (img == null || img.width != width || img.height != height) {
            toast("Screen is changing, try again"); revealBubble(RED); return
        }
        try {
            val plane = img.planes[0]
            val pixel = plane.pixelStride
            val padding = plane.rowStride - pixel * img.width
            val buf = plane.buffer
            buf.rewind()
            val wide = Bitmap.createBitmap(img.width + padding / pixel, img.height, Bitmap.Config.ARGB_8888)
            wide.copyPixelsFromBuffer(buf)
            val bmp = if (padding > 0) Bitmap.createBitmap(wide, 0, 0, img.width, img.height) else wide
            val stamp = SimpleDateFormat("yyyyMMdd-HHmmss-SSS", Locale.US).format(Date())
            val file = File(Shots.dir(this), "hunt-$stamp.png")
            file.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
            getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification())
            buzz()
            revealBubble()
            net.execute {
                val r = Uploader.uploadAll(this)
                getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification())
                if (r.failed == 0) {
                    flashBubble(GREEN)
                    toast("Sent to Hunt HQ")
                } else {
                    flashBubble(RED)
                    toast("Saved, upload failed: ${r.error}")
                }
            }
        } catch (e: Exception) {
            toast("Capture failed: ${e.message}")
            revealBubble(RED)
        }
    }

    private fun resizeTo(w: Int, h: Int) {
        val d = display ?: return
        val old = reader
        latest?.close(); latest = null
        val r = newReader(w, h)
        d.resize(w, h, dpi)
        d.surface = r.surface
        reader = r
        old?.close()
        width = w; height = h
    }

    private fun buildNotification(): Notification {
        val n = Shots.list(this).size
        val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        fun svc(code: Int, action: String) = PendingIntent.getService(
            this, code, Intent(this, CaptureService::class.java).setAction(action), flags
        )
        val send = PendingIntent.getActivity(this, 2, Intent(this, SendActivity::class.java), flags)
        val open = PendingIntent.getActivity(this, 3, Intent(this, MainActivity::class.java), flags)
        val icon = Icon.createWithResource(this, android.R.drawable.ic_menu_camera)
        val rv = RemoteViews(packageName, R.layout.notif_big).apply {
            setTextViewText(R.id.count, "Hunt HQ Capture: $n waiting")
            setOnClickPendingIntent(R.id.btn_capture, svc(1, ACTION_CAPTURE))
            setOnClickPendingIntent(R.id.btn_send, send)
            setOnClickPendingIntent(R.id.btn_stop, svc(4, ACTION_STOP))
        }
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_pokeball)
            .setContentTitle("Hunt HQ Capture")
            .setContentText("$n waiting to upload")
            .setStyle(Notification.DecoratedCustomViewStyle())
            .setCustomContentView(rv)
            .setCustomBigContentView(rv)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(icon, "Capture", svc(1, ACTION_CAPTURE)).build())
            .addAction(Notification.Action.Builder(icon, "Send all", send).build())
            .addAction(Notification.Action.Builder(icon, "Stop", svc(4, ACTION_STOP)).build())
            .build()
    }

    /** Hides the floating button (so it is not in the picture), then captures after a short wait. */
    private fun requestCapture(delayMs: Long) {
        main.post { bubble?.hide() }
        handler.postDelayed({ capture(false) }, delayMs)
    }

    /** Shows the button again after a capture. `flash` makes its ring flash that color. */
    private fun revealBubble(flash: Int? = null) {
        main.post {
            bubble?.show()
            if (flash != null) bubble?.flash(flash)
        }
    }

    private fun flashBubble(color: Int) {
        main.post { bubble?.flash(color) }
    }

    private fun showBubble() {
        if (!Settings.canDrawOverlays(this) || bubble != null) return
        val b = Bubble(this, ::screenSize) { requestCapture(250) }
        try { b.attach(); bubble = b } catch (e: Exception) { toast("Floating button failed: ${e.message}") }
    }

    private fun buzz() {
        getSystemService(Vibrator::class.java)
            .vibrate(VibrationEffect.createOneShot(60, VibrationEffect.DEFAULT_AMPLITUDE))
    }

    private fun toast(msg: String) {
        main.post { Toast.makeText(applicationContext, msg, Toast.LENGTH_SHORT).show() }
    }

    override fun onDestroy() {
        running = false
        bubble?.detach()
        bubble = null
        main.removeCallbacksAndMessages(null)
        handler.removeCallbacksAndMessages(null)
        latest?.close(); latest = null
        getSystemService(DisplayManager::class.java).unregisterDisplayListener(displayListener)
        display?.release(); display = null
        reader?.close(); reader = null
        projection?.stop(); projection = null
        thread.quitSafely()
        net.shutdown()
        super.onDestroy()
    }
}
