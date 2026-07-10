package ai.obrigada.guardian.perception

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.UUID

/** On-disk shape of an enrolled face. Kept separate so the storage format can evolve. */
@Serializable
private data class StoredFace(val id: String, val name: String, val embedding: FloatArray)

/**
 * Encrypted, on-device store of enrolled household faces (F2.2). Face vectors and the names
 * that go with them live only here, behind a hardware-backed master key (Android Keystore).
 * The cloud never sees a face vector or an enrollment image (CLAUDE.md rule #4) — enrollment
 * happens on the guardian and stays on the guardian.
 */
class FaceStore(context: Context) {

    private val json = Json { ignoreUnknownKeys = true }

    private val prefs: SharedPreferences by lazy {
        val masterKey =
            MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
        EncryptedSharedPreferences.create(
            context,
            "guardian_faces",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun list(): List<EnrolledFace> {
        val raw = prefs.getString(KEY_FACES, null) ?: return emptyList()
        return runCatching {
            json.decodeFromString<List<StoredFace>>(raw).map {
                EnrolledFace(it.id, it.name, it.embedding)
            }
        }.getOrDefault(emptyList())
    }

    fun count(): Int = list().size

    /** Enroll a household member. Returns the stored record (with its new id). */
    fun add(name: String, embedding: FloatArray): EnrolledFace {
        val face = EnrolledFace(UUID.randomUUID().toString(), name.trim(), embedding)
        save(list() + face)
        return face
    }

    fun remove(id: String) {
        save(list().filterNot { it.id == id })
    }

    /** Erase all enrolled faces — used by a remote wipe (F2.6). */
    fun clear() {
        prefs.edit().clear().apply()
    }

    private fun save(faces: List<EnrolledFace>) {
        val stored = faces.map { StoredFace(it.id, it.name, it.embedding) }
        prefs.edit().putString(KEY_FACES, json.encodeToString(stored)).apply()
    }

    private companion object {
        const val KEY_FACES = "faces"
    }
}
