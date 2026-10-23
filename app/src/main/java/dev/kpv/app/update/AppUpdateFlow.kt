package dev.kpv.app.update

import android.app.AlertDialog
import android.os.Build
import android.util.Log
import android.widget.ProgressBar
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import dev.kpv.app.BuildConfig
import dev.kpv.app.R
import kotlinx.coroutines.launch

/** GitHub release check + download/install prompt, shared by the home screen and settings. */
class AppUpdateFlow(private val activity: AppCompatActivity) {

    private var pendingUpdate: GithubApkReleaseInfo? = null
    private var updateInProgress = false
    private var checking = false

    /** Silent on failure / up to date when [userInitiated] is false (cold start). */
    fun check(userInitiated: Boolean) {
        if (!GithubApkReleaseUpdater.isConfigured() || checking) return
        checking = true
        if (userInitiated) toast(R.string.update_checking)
        activity.lifecycleScope.launch {
            GithubApkReleaseUpdater.fetchLatestApkRelease()
                .onSuccess { release ->
                    if (activity.isFinishing) return@onSuccess
                    if (isNewer(release)) {
                        showUpdateDialog(release)
                    } else if (userInitiated) {
                        toast(activity.getString(R.string.update_up_to_date, BuildConfig.VERSION_NAME))
                    }
                }
                .onFailure {
                    Log.i(TAG, "Update check failed: ${it.message}")
                    if (userInitiated) {
                        toast(activity.getString(R.string.update_check_failed, it.message ?: it.javaClass.simpleName))
                    }
                }
            checking = false
        }
    }

    /** Call from onResume so an update continues after the user allows unknown-source installs. */
    fun onResume() {
        val pending = pendingUpdate ?: return
        if (activity.packageManager.canRequestPackageInstalls()) {
            pendingUpdate = null
            downloadAndInstall(pending)
        }
    }

    private fun isNewer(release: GithubApkReleaseInfo): Boolean {
        val pm = activity.packageManager
        val installedCode =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pm.getPackageInfo(activity.packageName, 0).longVersionCode
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(activity.packageName, 0).versionCode.toLong()
            }
        val remoteCode = release.versionCode?.toLong()
        val codeSaysUpdate = remoteCode == null || remoteCode > installedCode
        val versus = ReleaseVersionCompare.compare(release.tagName, BuildConfig.VERSION_NAME)
        return codeSaysUpdate && versus == ReleaseVersionCompare.VersusInstalled.UPDATE_AVAILABLE
    }

    private fun showUpdateDialog(release: GithubApkReleaseInfo) {
        AlertDialog.Builder(activity)
            .setTitle(R.string.update_available_title)
            .setMessage(
                activity.getString(R.string.update_available_message, release.tagName, "v${BuildConfig.VERSION_NAME}"),
            )
            .setPositiveButton(R.string.update_install) { _, _ -> startUpdate(release) }
            .setNegativeButton(R.string.update_later, null)
            .show()
    }

    private fun startUpdate(release: GithubApkReleaseInfo) {
        if (GithubApkReleaseUpdater.ensureInstallFromUnknownSources(activity)) {
            downloadAndInstall(release)
        } else {
            pendingUpdate = release
            toast(R.string.update_allow_installs)
        }
    }

    private fun downloadAndInstall(release: GithubApkReleaseInfo) {
        if (updateInProgress) return
        updateInProgress = true
        val progress =
            AlertDialog.Builder(activity)
                .setTitle(R.string.update_downloading)
                .setView(ProgressBar(activity).apply { isIndeterminate = true; setPadding(0, 48, 0, 48) })
                .setCancelable(false)
                .show()
        activity.lifecycleScope.launch {
            val result = GithubApkReleaseUpdater.downloadApkToCache(activity, release.downloadUrl)
            progress.dismiss()
            updateInProgress = false
            result
                .onSuccess { apk ->
                    if (!GithubApkReleaseUpdater.canReplaceInstalledApp(activity, apk)) {
                        toast(R.string.update_failed_signature)
                        return@launch
                    }
                    GithubApkReleaseUpdater.startPackageInstall(activity, apk)
                }
                .onFailure {
                    toast(activity.getString(R.string.update_failed, it.message ?: it.javaClass.simpleName))
                }
        }
    }

    private fun toast(resId: Int) = Toast.makeText(activity, resId, Toast.LENGTH_LONG).show()

    private fun toast(text: String) = Toast.makeText(activity, text, Toast.LENGTH_LONG).show()

    private companion object {
        const val TAG = "AppUpdateFlow"
    }
}
