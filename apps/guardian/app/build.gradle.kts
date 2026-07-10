plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "ai.obrigada.guardian"
    compileSdk = 35

    defaultConfig {
        applicationId = "ai.obrigada.guardian"
        // Android 8.0. Old donated phones are the target; this still gives us
        // hardware-backed Keystore, lock-task kiosk, and CameraX.
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        // The backend base URL is a build config value so the same APK can point at a
        // local dev server or production. Override per build with -PbackendBaseUrl=...
        val backendBaseUrl = (project.findProperty("backendBaseUrl") as String?)
            ?: "http://10.0.2.2:3000"
        buildConfigField("String", "BACKEND_BASE_URL", "\"$backendBaseUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    androidResources {
        // MediaPipe memory-maps its models; keep the model assets uncompressed.
        noCompress += "task"
        noCompress += "tflite"
    }

    packaging {
        resources {
            // BouncyCastle and Paho ship duplicate license/notice metadata.
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            excludes += "/META-INF/versions/9/OSGI-INF/MANIFEST.MF"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.service)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)

    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.androidx.security.crypto)
    implementation(libs.kotlinx.coroutines.android)

    implementation(libs.paho.mqtt)
    implementation(libs.bouncycastle.pkix)
    implementation(libs.bouncycastle.prov)

    // On-device pose estimation + face detection (MediaPipe Tasks, LiteRT under the hood).
    implementation(libs.mediapipe.tasks.vision)
    // Raw TFLite runtime for the face-embedding model (any MobileFaceNet-family .tflite).
    implementation(libs.tflite)

    testImplementation(libs.junit)
}
