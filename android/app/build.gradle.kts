import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The upload token lives in local.properties (never committed): ingestToken=...
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "app.hunthq.capture"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.hunthq.capture"
        minSdk = 30
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"
        buildConfigField("String", "INGEST_TOKEN", "\"${localProps.getProperty("ingestToken", "")}\"")
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
}
