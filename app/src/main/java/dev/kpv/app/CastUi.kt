package dev.kpv.app

import android.content.Context
import androidx.appcompat.view.ContextThemeWrapper
import androidx.mediarouter.app.MediaRouteButton

/** MediaRouteButton requires an AppCompat theme with an opaque window background. */
object CastUi {
    fun mediaRouteButton(context: Context): MediaRouteButton {
        val themed = ContextThemeWrapper(context, R.style.Theme_Kpv_MediaRouterButton)
        return MediaRouteButton(themed)
    }
}
