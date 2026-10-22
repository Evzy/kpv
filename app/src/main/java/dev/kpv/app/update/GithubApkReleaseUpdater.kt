package dev.kpv.app.update

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import dev.kpv.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

data class GithubApkReleaseInfo(
    val tagName: String,
    val releaseTitle: String?,
    val assetName: String,
    val downloadUrl: String,
    /** From release `version.json` when published; else null. */
    val versionCode: Int?,
)

/** Sideload updater: latest GitHub Release `.apk` asset on [BuildConfig.UPDATE_GITHUB_REPO]. */
object GithubApkReleaseUpdater {
    private const val TIMEOUT_MS = 15_000
    private val userAgent = "KPV/${BuildConfig.VERSION_NAME}"

    fun isConfigured(): Boolean =
        BuildConfig.UPDATE_GITHUB_OWNER.isNotBlank() && BuildConfig.UPDATE_GITHUB_REPO.isNotBlank()

    suspend fun fetchLatestApkRelease(
        owner: String = BuildConfig.UPDATE_GITHUB_OWNER,
        repo: String = BuildConfig.UPDATE_GITHUB_REPO,
        token: String = BuildConfig.UPDATE_GITHUB_TOKEN,
    ): Result<GithubApkReleaseInfo> =
        withContext(Dispatchers.IO) {
            runCatching {
                val o = owner.trim()
                val r = repo.trim()
                require(o.isNotEmpty() && r.isNotEmpty()) { "GitHub owner/repo not configured" }
                val raw =
                    open("https://api.github.com/repos/$o/$r/releases/latest", token).run {
                        setRequestProperty("Accept", "application/vnd.github+json")
                        setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
                        try {
                            ensureOk()
                            inputStream.bufferedReader().use { it.readText() }
                        } finally {
                            disconnect()
                        }
                    }
                val release = JSONObject(raw)
                val tagName = release.getString("tag_name")
                val assets = release.optJSONArray("assets")
                val assetList =
                    (0 until (assets?.length() ?: 0)).map { assets!!.getJSONObject(it) }
                val apk =
                    assetList.firstOrNull { it.optString("name").endsWith(".apk", ignoreCase = true) }
                        ?: error("No .apk asset on latest release ($tagName)")
                val versionJson =
                    assetList.firstOrNull { it.optString("name") == "version.json" }
                val remoteVersionCode =
                    versionJson?.optString("browser_download_url")?.let { url ->
                        runCatching {
                            open(url, token).run {
                                try {
                                    ensureOk()
                                    JSONObject(inputStream.bufferedReader().use { it.readText() })
                                        .optInt("versionCode", -1)
                                        .takeIf { it > 0 }
                                } finally {
                                    disconnect()
                                }
                            }
                        }.getOrNull()
                    }
                GithubApkReleaseInfo(
                    tagName = tagName,
                    releaseTitle = release.optString("name").ifBlank { null },
                    assetName = apk.getString("name"),
                    downloadUrl = apk.getString("browser_download_url"),
                    versionCode = remoteVersionCode,
                )
            }
        }

    /** False when the APK cannot replace the installed app (different signing key). */
    fun canReplaceInstalledApp(context: Context, apkFile: File): Boolean {
        val pm = context.packageManager
        val archiveFlags =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageManager.GET_SIGNING_CERTIFICATES
            } else {
                @Suppress("DEPRECATION")
                PackageManager.GET_SIGNATURES
            }
        val incoming =
            pm.getPackageArchiveInfo(apkFile.absolutePath, archiveFlags) ?: return false
        incoming.applicationInfo?.let { appInfo ->
            appInfo.sourceDir = apkFile.absolutePath
            appInfo.publicSourceDir = apkFile.absolutePath
        }
        val installed =
            try {
                pm.getPackageInfo(context.packageName, archiveFlags)
            } catch (_: PackageManager.NameNotFoundException) {
                return true
            }
        return signingDigestsMatch(installed, incoming)
    }

    private fun signingDigestsMatch(
        installed: android.content.pm.PackageInfo,
        incoming: android.content.pm.PackageInfo,
    ): Boolean {
        val installedBytes = apkSignerDigests(installed)
        val incomingBytes = apkSignerDigests(incoming)
        if (installedBytes.isEmpty() || incomingBytes.isEmpty()) return false
        return installedBytes.any { a -> incomingBytes.any { b -> a.contentEquals(b) } }
    }

    private fun apkSignerDigests(packageInfo: android.content.pm.PackageInfo): List<ByteArray> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val info = packageInfo.signingInfo ?: return emptyList()
            val signers =
                if (info.hasMultipleSigners()) {
                    info.apkContentsSigners
                } else {
                    info.signingCertificateHistory
                }
            return signers?.map { it.toByteArray() } ?: emptyList()
        }
        @Suppress("DEPRECATION")
        return packageInfo.signatures?.map { it.toByteArray() } ?: emptyList()
    }

    fun ensureInstallFromUnknownSources(activity: Activity): Boolean {
        if (activity.packageManager.canRequestPackageInstalls()) return true
        val intent =
            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                data = Uri.parse("package:${activity.packageName}")
            }
        activity.startActivity(intent)
        return false
    }

    suspend fun downloadApkToCache(activity: Activity, downloadUrl: String): Result<File> =
        withContext(Dispatchers.IO) {
            runCatching {
                val dir = File(activity.cacheDir, "github_apk_updates").apply { mkdirs() }
                val out = File(dir, "KPV-update.apk")
                open(downloadUrl, BuildConfig.UPDATE_GITHUB_TOKEN).run {
                    setRequestProperty("Accept", "application/octet-stream")
                    try {
                        ensureOk()
                        inputStream.use { input -> out.outputStream().use { input.copyTo(it) } }
                    } finally {
                        disconnect()
                    }
                }
                out
            }
        }

    /** Opens the system package installer (same path that worked before v1.0.15). */
    fun startPackageInstall(activity: Activity, apkFile: File) {
        val uri =
            FileProvider.getUriForFile(
                activity,
                "${BuildConfig.APPLICATION_ID}.fileprovider",
                apkFile,
            )
        val intent =
            Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        val pm = activity.packageManager
        if (intent.resolveActivity(pm) != null) {
            activity.startActivity(intent)
            return
        }
        val install =
            Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
                data = uri
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        activity.startActivity(install)
    }

    private fun open(url: String, token: String): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", userAgent)
            if (token.isNotBlank()) {
                setRequestProperty("Authorization", "Bearer $token")
            }
        }

    private fun HttpURLConnection.ensureOk() {
        val code = responseCode
        check(code in 200..299) { "HTTP $code from ${url.host}" }
    }
}
