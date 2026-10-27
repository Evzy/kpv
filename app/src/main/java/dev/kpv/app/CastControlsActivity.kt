package dev.kpv.app

import android.os.Bundle
import android.view.Menu
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.appcompat.app.AlertDialog
import com.google.android.gms.cast.framework.CastButtonFactory
import com.google.android.gms.cast.framework.media.widget.ExpandedControllerActivity

/** Full-screen cast controls, opened from the mini controller or the cast notification. */
class CastControlsActivity : ExpandedControllerActivity() {

    private lateinit var resolveHost: FrameLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        resolveHost = FrameLayout(this)
        addContentView(resolveHost, ViewGroup.LayoutParams(1, 1))
        getButtonImageViewAt(SOURCES_SLOT).apply {
            setImageResource(R.drawable.ic_sources)
            contentDescription = getString(R.string.sources)
            setOnClickListener { showSourcePicker() }
        }
        getButtonImageViewAt(STOP_SLOT).apply {
            setImageResource(R.drawable.ic_stop)
            contentDescription = getString(R.string.cast_stop)
            setOnClickListener {
                CastPlayback.clear()
                CastController.remoteMediaClient()?.stop()
                finish()
            }
        }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        super.onCreateOptionsMenu(menu)
        menuInflater.inflate(R.menu.cast_controls, menu)
        CastButtonFactory.setUpMediaRouteButton(applicationContext, menu, R.id.media_route_menu_item)
        return true
    }

    override fun onResume() {
        super.onResume()
        CastPlayback.attachHost(this, resolveHost)
        getButtonImageViewAt(SOURCES_SLOT).visibility =
            if (CastPlayback.canSwitchSources) View.VISIBLE else View.INVISIBLE
    }

    override fun onPause() {
        CastPlayback.detachHost(this)
        super.onPause()
    }

    private fun showSourcePicker() {
        val sources = CastPlayback.item?.sources ?: return
        val current = CastPlayback.sourceIndex
        AlertDialog.Builder(this)
            .setTitle(R.string.sources)
            .setSingleChoiceItems(sources.map { it.label }.toTypedArray(), current) { dialog, which ->
                dialog.dismiss()
                if (which != current) CastPlayback.selectSource(which)
            }
            .show()
    }

    private companion object {
        const val SOURCES_SLOT = 0
        const val STOP_SLOT = 3
    }
}
