package app.hunthq.capture

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.net.Uri
import android.provider.Settings
import android.widget.Toast
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

/** One small screen: start the capture notification, send, delete. Built in code, no layout files. */
class MainActivity : Activity() {

    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(pad, pad * 2, pad, pad)
        }
        status = TextView(this).apply { textSize = 18f; setPadding(0, 0, 0, pad) }
        root.addView(status)
        root.addView(button("Start capture") { startFlow() })
        root.addView(button("Upload now") {
            Toast.makeText(this, "Uploading...", Toast.LENGTH_SHORT).show()
            Thread {
                val r = Uploader.uploadAll(this)
                runOnUiThread {
                    val msg = if (r.failed == 0) "Sent ${r.sent}" else "Failed: ${r.error}"
                    Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
                    refresh()
                }
            }.start()
        })
        root.addView(button("Send all") {
            startActivity(Intent(this, SendActivity::class.java))
        })
        root.addView(button("Delete all screenshots") { Shots.clear(this); refresh() })
        root.addView(button("Stop") { CaptureService.stop(this); refresh() })
        setContentView(root)
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun button(label: String, onClick: () -> Unit) =
        Button(this).apply { text = label; setOnClickListener { onClick() } }

    private fun refresh() {
        val n = Shots.list(this).size
        val state = if (CaptureService.running) "Capture is ON" else "Capture is off"
        status.text = "$state\n$n screenshot(s) waiting to upload"
    }

    // Step 1: notification permission (Android 13+). Step 2: screen-capture permission.
    private fun startFlow() {
        // Step 0: permission to draw the floating button over the game.
        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "Allow \"Display over other apps\", then come back and tap Start capture again", Toast.LENGTH_LONG).show()
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            return
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        } else {
            askScreenCapture()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, perms, results)
        askScreenCapture() // go on even if denied: capture still works, the notification may just be hidden
    }

    private fun askScreenCapture() {
        val mpm = getSystemService(MediaProjectionManager::class.java)
        startActivityForResult(mpm.createScreenCaptureIntent(), 100)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 100 && resultCode == RESULT_OK && data != null) {
            CaptureService.start(this, resultCode, data)
            finish() // back to the game; use the notification from here
        }
    }
}
