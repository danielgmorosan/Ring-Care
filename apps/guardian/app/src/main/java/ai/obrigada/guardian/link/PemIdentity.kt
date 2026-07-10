package ai.obrigada.guardian.link

import org.bouncycastle.asn1.pkcs.PrivateKeyInfo
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.bouncycastle.openssl.PEMKeyPair
import org.bouncycastle.openssl.PEMParser
import org.bouncycastle.openssl.jcajce.JcaPEMKeyConverter
import java.io.StringReader
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Security
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManagerFactory

/**
 * Turns the PEM identity issued at provisioning (client cert, private key, CA cert) into
 * an SSLSocketFactory for the mutual-TLS MQTT link. BouncyCastle parses the PEM so we
 * accept both PKCS#1 ("RSA PRIVATE KEY", what the backend's node-forge signer emits) and
 * PKCS#8 ("PRIVATE KEY") without hand-rolling ASN.1.
 */
object PemIdentity {

    init {
        // Register BouncyCastle for PEM parsing; harmless if already present.
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.addProvider(BouncyCastleProvider())
        }
    }

    fun socketFactory(certPem: String, keyPem: String, caPem: String): SSLSocketFactory {
        val clientCert = parseCertificate(certPem)
        val caCert = parseCertificate(caPem)
        val privateKey = parsePrivateKey(keyPem)
        val empty = CharArray(0)

        // Client identity: our private key + cert chain (device cert, then the CA).
        val keyStore =
            KeyStore.getInstance("PKCS12").apply {
                load(null, null)
                setKeyEntry("device", privateKey, empty, arrayOf(clientCert, caCert))
            }
        val keyManagers =
            KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
                .apply { init(keyStore, empty) }
                .keyManagers

        // Trust: only the Obrigada CA, so the phone will not talk to any other broker.
        val trustStore =
            KeyStore.getInstance("PKCS12").apply {
                load(null, null)
                setCertificateEntry("ca", caCert)
            }
        val trustManagers =
            TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
                .apply { init(trustStore) }
                .trustManagers

        // "TLS" negotiates the highest version both sides support. The broker targets
        // TLS 1.3; devices below API 29 fall back to 1.2, which EMQX also accepts.
        return SSLContext.getInstance("TLS")
            .apply { init(keyManagers, trustManagers, null) }
            .socketFactory
    }

    private fun parseCertificate(pem: String): X509Certificate =
        pem.byteInputStream().use { stream ->
            CertificateFactory.getInstance("X.509").generateCertificate(stream) as X509Certificate
        }

    private fun parsePrivateKey(pem: String): PrivateKey {
        PEMParser(StringReader(pem)).use { parser ->
            val converter = JcaPEMKeyConverter()
            return when (val obj = parser.readObject()) {
                is PEMKeyPair -> converter.getKeyPair(obj).private
                is PrivateKeyInfo -> converter.getPrivateKey(obj)
                else -> error("Unsupported private key PEM (${obj?.javaClass?.simpleName})")
            }
        }
    }
}
