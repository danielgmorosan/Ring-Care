package ai.obrigada.guardian.data

import kotlinx.serialization.Serializable

/** A phone redeems a claim code to bind to a family. No auth token — the code is it. */
@Serializable
data class ProvisionRequest(val code: String)

/**
 * What the backend returns when a claim code is redeemed (POST /provision). Mirrors
 * ProvisionResult in the backend. The cert material is present only when the device CA
 * is configured server-side; otherwise the phone runs token-only until certs are enabled.
 * These secrets are returned once, over TLS, and then live only in the phone's secure store.
 */
@Serializable
data class ProvisionResponse(
    val deviceId: String,
    val familyId: String,
    val deviceToken: String,
    val mqttUrl: String? = null,
    val heartbeatIntervalSeconds: Int,
    /** The elder-facing voice check-in language for this household (F1.3), e.g. "pt-PT". */
    val checkinLanguage: String = "en",
    val deviceCert: String? = null,
    val deviceKey: String? = null,
    val caCert: String? = null,
)
