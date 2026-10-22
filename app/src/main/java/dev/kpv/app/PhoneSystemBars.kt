package dev.kpv.app

import android.app.Activity
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/** Edge-to-edge on phones with manual padding for status + navigation bars. */
object PhoneSystemBars {

    fun enableEdgeToEdge(activity: Activity) {
        if (TvHelper.isTelevision(activity)) return
        WindowCompat.setDecorFitsSystemWindows(activity.window, false)
    }

    fun listen(activity: Activity, root: View, apply: (WindowInsetsCompat, View) -> Unit) {
        if (TvHelper.isTelevision(activity)) return
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            apply(insets, view)
            insets
        }
        ViewCompat.requestApplyInsets(root)
    }

    fun systemBarInsets(insets: WindowInsetsCompat): androidx.core.graphics.Insets =
        insets.getInsets(WindowInsetsCompat.Type.systemBars())
}
