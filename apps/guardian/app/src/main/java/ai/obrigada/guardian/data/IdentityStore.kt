package ai.obrigada.guardian.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Encrypted, at-rest storage for the guardian's identity. Backed by a hardware-backed
 * master key (Android Keystore) so the device token and private key are unreadable to
 * other apps or an offline attacker with the flash image. Nothing here is ever uploaded.
 */
class IdentityStore(context: Context) {

    private val prefs: SharedPreferences by lazy {
        val masterKey =
            MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
        EncryptedSharedPreferences.create(
            context,
            "guardian_identity",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    val isPaired: Boolean
        get() = prefs.contains(KEY_DEVICE_ID)

    /**
     * True once the caregiver has finished setup (faces + zones) and tapped "Start watching".
     * The app only locks into kiosk when this is true, so setup is never trapped behind the
     * lock. Cleared by [clear] on re-pair, and by [markSetupIncomplete] when a caregiver
     * exits kiosk to make changes.
     */
    val isSetupComplete: Boolean
        get() = prefs.getBoolean(KEY_SETUP_COMPLETE, false)

    fun markSetupComplete() = prefs.edit().putBoolean(KEY_SETUP_COMPLETE, true).apply()

    fun markSetupIncomplete() = prefs.edit().putBoolean(KEY_SETUP_COMPLETE, false).apply()

    fun save(response: ProvisionResponse) {
        prefs.edit()
            .putString(KEY_DEVICE_ID, response.deviceId)
            .putString(KEY_FAMILY_ID, response.familyId)
            .putString(KEY_TOKEN, response.deviceToken)
            .putString(KEY_MQTT_URL, response.mqttUrl)
            .putInt(KEY_HEARTBEAT, response.heartbeatIntervalSeconds)
            .putString(KEY_CHECKIN_LANGUAGE, response.checkinLanguage)
            .putString(KEY_CERT, response.deviceCert)
            .putString(KEY_KEY, response.deviceKey)
            .putString(KEY_CA, response.caCert)
            .apply()
    }

    fun load(): DeviceIdentity? {
        val deviceId = prefs.getString(KEY_DEVICE_ID, null) ?: return null
        return DeviceIdentity(
            deviceId = deviceId,
            familyId = prefs.getString(KEY_FAMILY_ID, "").orEmpty(),
            deviceToken = prefs.getString(KEY_TOKEN, "").orEmpty(),
            mqttUrl = prefs.getString(KEY_MQTT_URL, null),
            heartbeatIntervalSeconds = prefs.getInt(KEY_HEARTBEAT, 30),
            checkinLanguage = prefs.getString(KEY_CHECKIN_LANGUAGE, "en").orEmpty().ifBlank { "en" },
            deviceCertPem = prefs.getString(KEY_CERT, null),
            deviceKeyPem = prefs.getString(KEY_KEY, null),
            caCertPem = prefs.getString(KEY_CA, null),
        )
    }

    /** Unbind this guardian. A destructive local reset — used before re-pairing. */
    fun clear() = prefs.edit().clear().apply()

    private companion object {
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_FAMILY_ID = "family_id"
        const val KEY_TOKEN = "device_token"
        const val KEY_MQTT_URL = "mqtt_url"
        const val KEY_HEARTBEAT = "heartbeat_interval_seconds"
        const val KEY_CHECKIN_LANGUAGE = "checkin_language"
        const val KEY_CERT = "device_cert_pem"
        const val KEY_KEY = "device_key_pem"
        const val KEY_CA = "ca_cert_pem"
        const val KEY_SETUP_COMPLETE = "setup_complete"
    }
}
