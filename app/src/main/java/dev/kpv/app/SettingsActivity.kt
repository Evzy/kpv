package dev.kpv.app

import android.os.Bundle
import android.view.KeyEvent
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.updatePadding
import dev.kpv.app.update.AppUpdateFlow

class SettingsActivity : AppCompatActivity() {

    private val updateFlow = AppUpdateFlow(this)

    override fun onResume() {
        super.onResume()
        updateFlow.onResume()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        TvHelper.applyScreenOrientation(this)
        PhoneSystemBars.enableEdgeToEdge(this)
        setContentView(R.layout.activity_settings)
        if (!TvHelper.isTelevision(this)) {
            val scroll = findViewById<ScrollView>(R.id.settings_scroll)
            PhoneSystemBars.listen(this, scroll) { insets, view ->
                val bars = PhoneSystemBars.systemBarInsets(insets)
                view.updatePadding(
                    left = bars.left,
                    top = bars.top,
                    right = bars.right,
                    bottom = bars.bottom,
                )
            }
        }

        val site = findViewById<EditText>(R.id.site_origin)
        site.setText(SiteConfig.siteUrl())
        site.setOnEditorActionListener { _, actionId, event ->
            val action = actionId and EditorInfo.IME_MASK_ACTION
            val enterKey =
                event?.keyCode == KeyEvent.KEYCODE_ENTER &&
                    event.action == KeyEvent.ACTION_DOWN
            val imeDone =
                action == EditorInfo.IME_ACTION_DONE ||
                    action == EditorInfo.IME_ACTION_GO ||
                    action == EditorInfo.IME_ACTION_SEND
            if (imeDone || enterKey) {
                saveSiteAndFinish()
            } else {
                false
            }
        }
        site.setOnKeyListener { _, keyCode, event ->
            if (
                keyCode == KeyEvent.KEYCODE_ENTER &&
                    event.action == KeyEvent.ACTION_DOWN &&
                    site.isFocused
            ) {
                saveSiteAndFinish()
            } else {
                false
            }
        }

        findViewById<Button>(R.id.save).setOnClickListener { saveSiteAndFinish() }
        findViewById<TextView>(R.id.app_version).text =
            getString(R.string.settings_installed_version, BuildConfig.VERSION_NAME)
        findViewById<Button>(R.id.check_updates).setOnClickListener { updateFlow.check(userInitiated = true) }
    }

    private fun saveSiteAndFinish(): Boolean {
        val site = findViewById<EditText>(R.id.site_origin)
        val s = site.text.toString().trim()
        if (s.isBlank()) {
            Toast.makeText(this, R.string.settings_site_required, Toast.LENGTH_SHORT).show()
            return false
        }
        val imm = getSystemService(InputMethodManager::class.java)
        imm?.hideSoftInputFromWindow(site.windowToken, 0)
        SiteConfig.saveSite(s)
        setResult(RESULT_OK)
        finish()
        return true
    }
}
