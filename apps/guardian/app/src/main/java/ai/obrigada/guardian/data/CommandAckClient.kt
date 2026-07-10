package ai.obrigada.guardian.data

import ai.obrigada.guardian.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

@Serializable
private data class CommandAckBody(
    val deviceId: String,
    val commandId: String,
    val status: String,
    val detail: String? = null,
)

/**
 * Acknowledges a backend command (F2.6) over the device-authed telemetry path
 * (POST /telemetry/command-ack, Bearer device token). Called from the wipe flow before the
 * identity is cleared, so the caregiver sees the command was carried out.
 */
class CommandAckClient(
    private val deviceId: String,
    private val deviceToken: String,
    private val baseUrl: String = BuildConfig.BACKEND_BASE_URL,
) {
    private val json = Json { encodeDefaults = false }

    private val client =
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .build()

    /** Report that a command executed or failed. Throws on a non-2xx or transport failure. */
    suspend fun ack(commandId: String, status: String, detail: String? = null) {
        withContext(Dispatchers.IO) {
            val payload =
                CommandAckBody(
                    deviceId = deviceId,
                    commandId = commandId,
                    status = status,
                    detail = detail,
                )
            val body =
                json.encodeToString(CommandAckBody.serializer(), payload).toRequestBody(JSON_MEDIA)
            val request =
                Request.Builder()
                    .url("${baseUrl.trimEnd('/')}/telemetry/command-ack")
                    .header("Authorization", "Bearer $deviceToken")
                    .post(body)
                    .build()
            client.newCall(request).execute().use { response ->
                check(response.isSuccessful) { "command ack failed (HTTP ${response.code})" }
            }
        }
    }

    private companion object {
        val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }
}
