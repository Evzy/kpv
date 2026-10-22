package dev.kpv.app

import android.app.Activity
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast

class SettingsActivity : Activity() {

    private lateinit var companionPinLabel: TextView
    private lateinit var companionUrlLabel: TextView
    private lateinit var companionPairedLabel: TextView
    private lateinit var companionRevoke: Button
    private lateinit var companionSwitch: Switch
    private var hideCompanionUi = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        TvHelper.applyScreenOrientation(this)
        setContentView(R.layout.activity_settings)
        hideCompanionUi = TvHelper.isTelevision(this)

        val site = findViewById<EditText>(R.id.site_origin)
        site.setText(SiteConfig.siteUrl())
        site.setOnEditorActionListener { _, actionId, event ->
            val doneKey =
                event?.keyCode == KeyEvent.KEYCODE_ENTER &&
                    event.action == KeyEvent.ACTION_DOWN
            if (actionId == EditorInfo.IME_ACTION_DONE || actionId == EditorInfo.IME_ACTION_GO || doneKey) {
                saveSiteAndFinish()
            } else {
                false
            }
        }

        companionSwitch = findViewById(R.id.companion_enabled)
        companionPinLabel = findViewById(R.id.companion_pin_label)
        companionUrlLabel = findViewById(R.id.companion_url_label)
        companionPairedLabel = findViewById(R.id.companion_paired_label)
        companionRevoke = findViewById(R.id.companion_revoke)

        if (hideCompanionUi) {
            hideCompanionSection()
        } else {
            companionSwitch.isChecked = SiteConfig.isCompanionEnabled()
            companionSwitch.setOnCheckedChangeListener { _, _ -> refreshCompanionUi() }
            companionRevoke.setOnClickListener {
                CompanionPairing.revokeAllTokens()
                Toast.makeText(this, R.string.companion_revoke, Toast.LENGTH_SHORT).show()
                refreshCompanionUi()
            }
        }

        findViewById<Button>(R.id.save).setOnClickListener { saveSiteAndFinish() }

        if (!hideCompanionUi) {
            refreshCompanionUi()
        }
    }

    override fun onResume() {
        super.onResume()
        if (!hideCompanionUi) {
            refreshCompanionUi()
        }
    }

    private fun saveSiteAndFinish(): Boolean {
        val site = findViewById<EditText>(R.id.site_origin)
        val s = site.text.toString().trim()
        if (s.isBlank()) {
            Toast.makeText(this, R.string.settings_site_required, Toast.LENGTH_SHORT).show()
            return false
        }
        SiteConfig.saveSite(s)
        if (!hideCompanionUi) {
            SiteConfig.setCompanionEnabled(companionSwitch.isChecked)
        }
        setResult(RESULT_OK)
        finish()
        return true
    }

    private fun hideCompanionSection() {
        companionSwitch.visibility = View.GONE
        companionPinLabel.visibility = View.GONE
        companionUrlLabel.visibility = View.GONE
        companionPairedLabel.visibility = View.GONE
        companionRevoke.visibility = View.GONE
        TvCompanion.stop()
    }

    private fun refreshCompanionUi() {
        if (hideCompanionUi) return
        val enabled = companionSwitch.isChecked
        companionPairedLabel.text = getString(
            R.string.companion_paired_count,
            CompanionPairing.pairedDeviceCount(),
        )
        if (!enabled) {
            if (!SiteConfig.isCompanionEnabled()) {
                TvCompanion.stop()
            }
            companionPinLabel.visibility = View.GONE
            companionUrlLabel.visibility = View.GONE
            companionRevoke.visibility = View.GONE
            return
        }
        TvCompanion.startIfEnabled(allowPreview = true)
        companionRevoke.visibility =
            if (CompanionPairing.pairedDeviceCount() > 0) View.VISIBLE else View.GONE
        val pin = TvCompanion.pairingPin()
        if (pin != null) {
            companionPinLabel.visibility = View.VISIBLE
            companionPinLabel.text = getString(R.string.companion_pin_waiting, pin)
        } else {
            companionPinLabel.visibility = View.VISIBLE
            companionPinLabel.text = getString(R.string.companion_keep_app_open)
        }
        val base = TvCompanion.baseUrl()
        if (base != null) {
            companionUrlLabel.visibility = View.VISIBLE
            companionUrlLabel.text = getString(R.string.companion_url_format, base)
        } else {
            companionUrlLabel.visibility = View.VISIBLE
            companionUrlLabel.text = getString(R.string.companion_keep_app_open)
        }
    }
}
