import groovy.json.JsonSlurper
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

private val localProperties: Properties =
    Properties().apply {
        val f = rootProject.file("local.properties")
        if (f.exists()) f.inputStream().use { load(it) }
    }

private fun localPropOrEnv(propertyKey: String): String {
    val fromFile = localProperties.getProperty(propertyKey, "")?.trim().orEmpty()
    if (fromFile.isNotEmpty()) return fromFile
    return System.getenv(propertyKey)?.trim().orEmpty()
}

private fun escapeForBuildConfigString(s: String): String =
    buildString {
        for (c in s) {
            when (c) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\n' -> append("\\n")
                '\r' -> Unit
                else -> append(c)
            }
        }
    }

@Suppress("UNCHECKED_CAST")
private val releaseMeta: Map<String, Any?> =
    rootProject.file("release/version.json").let { f ->
        if (f.exists()) JsonSlurper().parseText(f.readText()) as Map<String, Any?> else emptyMap()
    }

android {
    namespace = "dev.kpv.app"
    compileSdk = 35

    signingConfigs {
        getByName("debug") {
            val envPath = System.getenv("KPV_SHARED_DEBUG_KEYSTORE")
            val propPath = localProperties.getProperty("debug.storeFile")
            val keystoreFile =
                when {
                    !envPath.isNullOrBlank() -> file(envPath)
                    !propPath.isNullOrBlank() -> file(propPath)
                    else -> null
                }
            if (keystoreFile != null && keystoreFile.isFile) {
                val storePass =
                    localProperties.getProperty("debug.storePassword")
                        ?: System.getenv("KPV_SHARED_DEBUG_STORE_PASSWORD")
                val alias =
                    localProperties.getProperty("debug.keyAlias")
                        ?: System.getenv("KPV_SHARED_DEBUG_KEY_ALIAS")
                val keyPass =
                    localProperties.getProperty("debug.keyPassword")
                        ?: System.getenv("KPV_SHARED_DEBUG_KEY_PASSWORD")
                if (!storePass.isNullOrBlank() && !alias.isNullOrBlank() && !keyPass.isNullOrBlank()) {
                    storeFile = keystoreFile
                    storePassword = storePass
                    keyAlias = alias
                    keyPassword = keyPass
                }
            }
        }
    }

    defaultConfig {
        applicationId = "dev.kpv.app"
        minSdk = 21
        targetSdk = 35
        versionCode = (releaseMeta["versionCode"] as? Number)?.toInt() ?: 1
        versionName = releaseMeta["version"]?.toString() ?: "1.0.0"

        val defaultOwner =
            releaseMeta["githubOwner"]?.toString()?.trim().orEmpty().ifEmpty { "Evzy" }
        val updateOwner = escapeForBuildConfigString(localPropOrEnv("UPDATE_GITHUB_OWNER").ifEmpty { defaultOwner })
        val updateRepo = escapeForBuildConfigString(localPropOrEnv("UPDATE_GITHUB_REPO").ifEmpty { "kpv-releases" })
        val updateToken = escapeForBuildConfigString(localPropOrEnv("UPDATE_GITHUB_TOKEN"))
        buildConfigField("String", "UPDATE_GITHUB_OWNER", "\"$updateOwner\"")
        buildConfigField("String", "UPDATE_GITHUB_REPO", "\"$updateRepo\"")
        buildConfigField("String", "UPDATE_GITHUB_TOKEN", "\"$updateToken\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
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
        buildConfig = true
    }
}

val copySiteConfig = tasks.register<Copy>("copySiteConfig") {
    from(rootProject.file("site.config.properties"))
    into(layout.projectDirectory.dir("src/main/assets"))
}

tasks.named("preBuild") {
    dependsOn(copySiteConfig)
}

dependencies {
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")
    implementation("com.github.bumptech.glide:glide:4.16.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("org.nanohttpd:nanohttpd:2.3.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    testImplementation("junit:junit:4.13.2")
}
