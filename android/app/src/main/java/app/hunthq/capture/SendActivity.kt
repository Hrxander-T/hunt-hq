package app.hunthq.capture

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.core.content.FileProvider

/**
 * Invisible screen opened by the notification's "Send all".
 * Shares every kept screenshot, the same way the Share menu does, then closes itself.
 * If the installed Hunt HQ app is found, it is opened directly. Otherwise Android's share list appears.
 */
class SendActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sendAll()
        finish()
    }

    private fun sendAll() {
        val files = Shots.list(this)
        if (files.isEmpty()) {
            Toast.makeText(this, "Nothing to send", Toast.LENGTH_SHORT).show()
            return
        }
        val uris = files.map { FileProvider.getUriForFile(this, "$packageName.files", it) }

        val send = if (uris.size == 1) {
            Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, uris[0])
        } else {
            Intent(Intent.ACTION_SEND_MULTIPLE)
                .putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList<Uri>(uris))
        }
        send.type = "image/*"
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        send.clipData = ClipData.newRawUri("screenshots", uris[0]).also { clip ->
            uris.drop(1).forEach { clip.addItem(ClipData.Item(it)) }
        }

        val hunt = packageManager
            .queryIntentActivities(send, PackageManager.MATCH_DEFAULT_ONLY)
            .firstOrNull {
                it.activityInfo.packageName != packageName &&
                    it.loadLabel(packageManager).toString().contains("Hunt HQ", ignoreCase = true)
            }

        try {
            if (hunt != null) {
                send.setClassName(hunt.activityInfo.packageName, hunt.activityInfo.name)
                startActivity(send)
            } else {
                startActivity(Intent.createChooser(send, "Send to Hunt HQ").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        } catch (e: Exception) {
            Toast.makeText(this, "Could not share: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
}
