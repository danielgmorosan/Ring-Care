package ai.obrigada.guardian.data

import ai.obrigada.guardian.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * The guardian's device-authed roster read (F2.2). Fetches the household roster the caregiver
 * built in the family app so face enrollment can offer their names, instead of asking the
 * caregiver to type each one a second time. Authenticated by the per-device token (Bearer),
 * the same credential as the heartbeat and zones-sync paths — no user session. Only labels
 * come down; no biometric ever travels (CLAUDE.md rules #1/#4).
 */
class RosterClient(
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

    /** The active household roster, or an empty list on any failure (enrollment still works,
     * it just falls back to a typed name). */
    suspend fun fetch(): List<RosterEntry> =
        withContext(Dispatchers.IO) {
            val url =
                "${baseUrl.trimEnd('/')}/telemetry/roster".toHttpUrl()
                    .newBuilder()
                    .addQueryParameter("deviceId", deviceId)
                    .build()
            val request =
                Request.Builder()
                    .url(url)
                    .get()
                    .header("Authorization", "Bearer $deviceToken")
                    .build()
            runCatching {
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@use emptyList()
                    val body = response.body?.string().orEmpty()
                    json.decodeFromString(ListSerializer(RosterEntry.serializer()), body)
                }
            }.getOrDefault(emptyList())
        }
}
