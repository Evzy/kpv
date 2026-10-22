package dev.kpv.app.update

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.widget.Toast
import dev.kpv.app.R

/** Delivers [PackageInstaller] commit results for sideloaded KPV updates. */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val detail = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE).orEmpty()
        val message =
            when (status) {
                PackageInstaller.STATUS_SUCCESS -> return
                PackageInstaller.STATUS_FAILURE_CONFLICT,
                PackageInstaller.STATUS_FAILURE_INCOMPATIBLE,
                ->
                    context.getString(R.string.update_failed_signature)
                else ->
                    context.getString(
                        R.string.update_failed,
                        detail.ifBlank { context.getString(R.string.update_failed_generic) },
                    )
            }
        Toast.makeText(context.applicationContext, message, Toast.LENGTH_LONG).show()
    }
}
