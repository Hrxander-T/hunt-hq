package app.hunthq.capture

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Sends kept screenshots to Cloudinary, then tells Supabase (edge function ingest-shot) about them.
 * A screenshot is deleted from the phone only after both steps worked. If something fails it stays and is retried next time.
 */
object Uploader {
    private const val CLOUD = "njyhj0df"
    private const val PRESET = "hunt_pending"
    private const val INGEST_URL = "https://mhijdykuzrpekizmrpck.supabase.co/functions/v1/ingest-shot"

    data class Result(val sent: Int, val failed: Int, val error: String?)

    fun token(): String = BuildConfig.INGEST_TOKEN

    @Synchronized
    fun uploadAll(c: Context): Result {
        val files = Shots.list(c)
        val tok = token()
        if (tok.isBlank()) return Result(0, files.size, "ingestToken is missing in local.properties")
        var sent = 0
        var failed = 0
        var error: String? = null
        for (f in files) {
            try {
                // The Cloudinary answer is remembered next to the file, so a retry never uploads the picture twice.
                val side = File(f.path + ".json")
                val cloud = if (side.exists()) JSONObject(side.readText()) else toCloudinary(f).also { side.writeText(it.toString()) }
                toSupabase(cloud.getString("public_id"), cloud.getString("secure_url"), tok)
                f.delete()
                side.delete()
                sent++
            } catch (e: Exception) {
                failed++
                error = e.message ?: e.javaClass.simpleName
            }
        }
        return Result(sent, failed, error)
    }

    private fun toCloudinary(f: File): JSONObject {
        val boundary = "----hunt${System.currentTimeMillis()}"
        val conn = URL("https://api.cloudinary.com/v1_1/$CLOUD/image/upload").openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.doOutput = true
        conn.connectTimeout = 15_000
        conn.readTimeout = 60_000
        conn.setChunkedStreamingMode(0)
        conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        conn.outputStream.use { out ->
            out.write("--$boundary\r\nContent-Disposition: form-data; name=\"upload_preset\"\r\n\r\n$PRESET\r\n".toByteArray())
            out.write("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"${f.name}\"\r\nContent-Type: image/png\r\n\r\n".toByteArray())
            f.inputStream().use { it.copyTo(out) }
            out.write("\r\n--$boundary--\r\n".toByteArray())
        }
        val code = conn.responseCode
        val body = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.readText() ?: ""
        if (code !in 200..299) throw IOException("Cloudinary $code: ${body.take(120)}")
        return JSONObject(body)
    }

    private fun toSupabase(publicId: String, url: String, token: String) {
        val conn = URL(INGEST_URL).openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.doOutput = true
        conn.connectTimeout = 15_000
        conn.readTimeout = 30_000
        conn.setRequestProperty("Content-Type", "application/json")
        conn.setRequestProperty("x-ingest-token", token)
        conn.outputStream.use { it.write(JSONObject().put("public_id", publicId).put("url", url).toString().toByteArray()) }
        val code = conn.responseCode
        val body = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.readText() ?: ""
        if (code == 401) throw IOException("Wrong upload token")
        if (code !in 200..299) throw IOException("Server $code: ${body.take(120)}")
    }
}
