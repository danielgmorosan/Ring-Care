package ai.obrigada.guardian.data

import ai.obrigada.guardian.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * The guardian's thin HTTP client to the backend. Only pairing goes over HTTP; once the
 * phone has its certificate, perception events and heartbeats travel the mutual-TLS MQTT
 * link. Base URL is a build config value (BACKEND_BASE_URL) so one APK serves dev and prod.
 */
class BackendApi(
    private val baseUrl: String = BuildConfig.BACKEND_BASE_URL,
) {
    private val json = Json { ignoreUnknownKeys = true }

    private val client =
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()

    /** Redeem a claim code. Throws [PairingException] with a caregiver-readable message. */
    suspend fun provision(code: String): ProvisionResponse =
        withContext(Dispatchers.IO) {
            val body =
                json.encodeToString(ProvisionRequest.serializer(), ProvisionRequest(code))
                    .toRequestBody(JSON_MEDIA)
            val request =
                Request.Builder()
                    .url("${baseUrl.trimEnd('/')}/provision")
                    .post(body)
                    .build()

            try {
                client.newCall(request).execute().use { response ->
                    val payload = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        // The backend returns the same generic error for every bad code so
                        // the endpoint is not a code-guessing oracle. Surface it plainly.
                        throw PairingException(
                            if (response.code == 401) {
                                "That code is not valid or has expired. Ask for a new one."
                            } else {
                                "The server could not pair this phone (HTTP ${response.code})."
                            }
                        )
                    }
                    json.decodeFromString(ProvisionResponse.serializer(), payload)
                }
            } catch (e: IOException) {
                throw PairingException("Could not reach the server. Check the network and try again.", e)
            }
        }

    private companion object {
        val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }
}

/** A pairing failure with a message safe to show the caregiver. */
class PairingException(message: String, cause: Throwable? = null) : Exception(message, cause)
