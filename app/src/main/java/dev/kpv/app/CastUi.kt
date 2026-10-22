package dev.kpv.app

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.fragment.app.FragmentActivity
import com.google.android.gms.cast.framework.CastButtonFactory

object CastUi {

    fun attachRouteButton(
        activity: FragmentActivity,
        parent: ViewGroup,
        contentDescription: CharSequence,
    ): KpvMediaRouteButton {
        val button = LayoutInflater.from(activity)
            .inflate(R.layout.widget_cast_button, parent, false) as KpvMediaRouteButton
        button.contentDescription = contentDescription
        CastButtonFactory.setUpMediaRouteButton(activity, button)
        parent.addView(button)
        return button
    }
}
