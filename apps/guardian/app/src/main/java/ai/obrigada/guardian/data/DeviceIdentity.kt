package ai.obrigada.guardian.data

/**
 * The guardian's provisioned identity: who it is to the backend and how it connects.
 * Assembled from the provision response and persisted in the encrypted store. The
 * private key never leaves this device (CONTRIBUTING.md rule #4 posture for device identity).
 */
data class DeviceIdentity(
    val deviceId: String,
    val familyId: String,
    val deviceToken: String,
    val mqttUrl: String?,
    val heartbeatIntervalSeconds: Int,
    /** The household's elder-facing check-in language (F1.3), e.g. "en" or "pt-PT". */
    val checkinLanguage: String,
    val deviceCertPem: String?,
    val deviceKeyPem: String?,
    val caCertPem: String?,
) {
    /** True when the phone has full mutual-TLS material and a broker to connect to. */
    val hasMutualTls: Boolean
        get() =
            !mqttUrl.isNullOrBlank() &&
                !deviceCertPem.isNullOrBlank() &&
                !deviceKeyPem.isNullOrBlank() &&
                !caCertPem.isNullOrBlank()
}
