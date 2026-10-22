package dev.kpv.app.update

import android.app.Activity
import android.content.Intent
import android.net.Uri
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
                val apk =
                    (0 until (assets?.length() ?: 0))
                        .map { assets!!.getJSONObject(it) }
                        .firstOrNull { it.optString("name").endsWith(".apk", ignoreCase = true) }
                        ?: error("No .apk asset on latest release ($tagName)")
                GithubApkReleaseInfo(
                    tagName = tagName,
                    releaseTitle = release.optString("name").ifBlank { null },
                    assetName = apk.getString("name"),
                    downloadUrl = apk.getString("browser_download_url"),
                )
            }
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
        activity.startActivity(intent)
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
