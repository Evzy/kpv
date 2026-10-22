package dev.kpv.app

import android.widget.FrameLayout

/** Activity that can run [StreamResolver] for LAN companion requests. */
interface CompanionHost {
    val resolveContainer: FrameLayout
    fun runOnUiThread(action: () -> Unit)
    fun isHostAlive(): Boolean
}
