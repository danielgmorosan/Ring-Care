package ai.obrigada.guardian.data

import ai.obrigada.guardian.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * The guardian's device-authed zones sync (F2.3). Fetches the device's active zones to run
 * geometry locally and posts a zone the caregiver drew on the device. Authenticated by the
 * per-device token (Bearer), the same credential as the heartbeat path — no user session.
 */
class ZonesClient(
    private val deviceId: String,
    private val deviceToken: String,
    private val baseUrl: String = BuildConfig.BACKEND_BASE_URL,
) {
    private val json = Json { ignoreUnknownKeys = true }

    private val client =
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()

    /** The device's active zones, or an empty list on any failure (geometry just runs on none). */
    suspend fun fetch(): List<Zone> =
        withContext(Dispatchers.IO) {
            val url =
                "${baseUrl.trimEnd('/')}/telemetry/zones".toHttpUrl()
                    .newBuilder()
                    .addQueryParameter("deviceId", deviceId)
                    .build()
            val request = Request.Builder().url(url).get().authorized().build()
            runCatching {
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@use emptyList()
                    val body = response.body?.string().orEmpty()
                    json.decodeFromString(ListSerializer(Zone.serializer()), body)
                }
            }.getOrDefault(emptyList())
        }

    /** Save a zone the caregiver drew on this device. Throws on failure so the UI can report it. */
    suspend fun create(name: String, kind: String, points: List<ZoneVertex>): Zone =
        withContext(Dispatchers.IO) {
            val payload = CreateZoneBody(deviceId = deviceId, name = name, kind = kind, points = points)
            val body =
                json.encodeToString(CreateZoneBody.serializer(), payload).toRequestBody(JSON_MEDIA)
            val request =
                Request.Builder()
                    .url("${baseUrl.trimEnd('/')}/telemetry/zones")
                    .post(body)
                    .authorized()
                    .build()
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                check(response.isSuccessful) { "Could not save the zone (HTTP ${response.code})." }
                json.decodeFromString(Zone.serializer(), text)
            }
        }

    private fun Request.Builder.authorized(): Request.Builder =
        header("Authorization", "Bearer $deviceToken")

    private companion object {
        val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }
}
