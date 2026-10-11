package app.hunthq.capture

import android.content.Context
import java.io.File

/** The screenshots kept inside the app (private folder, other apps cannot see them). */
object Shots {
    fun dir(c: Context): File = File(c.filesDir, "shots").apply { mkdirs() }

    fun list(c: Context): List<File> =
        dir(c).listFiles { f -> f.extension == "png" }?.sortedBy { it.name } ?: emptyList()

    fun clear(c: Context) = list(c).forEach { it.delete() }
}
