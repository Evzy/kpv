package dev.kpv.app

import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.updatePadding
import dev.kpv.app.sites.SiteEntry
import dev.kpv.app.sites.SiteKind
import dev.kpv.app.sites.SiteKindDetector
import dev.kpv.app.sites.SiteList
import dev.kpv.app.sites.SiteListCodec
import dev.kpv.app.update.AppUpdateFlow

class SettingsActivity : AppCompatActivity() {

    private val updateFlow = AppUpdateFlow(this)
    private var startTopEntry = SiteList.top()
    private var checkingOrigin: String? = null

    override fun onResume() {
        super.onResume()
        updateFlow.onResume()
        val focused = focusedSiteButton()
        renderSites(focused?.first, focused?.second ?: 0)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(KEY_START_TOP, SiteListCodec.encode(listOfNotNull(startTopEntry)))
    }

    override fun finish() {
        // A re-check can change the top site's parser without changing its address.
        setResult(if (SiteList.top() != startTopEntry) RESULT_OK else RESULT_CANCELED)
        super.finish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        savedInstanceState?.getString(KEY_START_TOP)?.let {
            startTopEntry = SiteListCodec.decode(it).firstOrNull()
        }
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

        bindSites()
        findViewById<Button>(R.id.customize_categories).setOnClickListener {
            startActivity(android.content.Intent(this, CategoryEditorActivity::class.java))
        }
        findViewById<TextView>(R.id.app_version).text =
            getString(R.string.settings_installed_version, BuildConfig.VERSION_NAME)
        findViewById<Button>(R.id.check_updates).setOnClickListener { updateFlow.check(userInitiated = true) }
    }

    private fun bindSites() {
        val input = findViewById<EditText>(R.id.site_origin)
        val add = findViewById<Button>(R.id.add_site)
        add.setOnClickListener { addSite(input.text.toString()) }
        input.setOnEditorActionListener { _, actionId, event ->
            val done = (actionId and EditorInfo.IME_MASK_ACTION) in
                setOf(EditorInfo.IME_ACTION_DONE, EditorInfo.IME_ACTION_GO, EditorInfo.IME_ACTION_SEND)
            val enter = event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN
            if (done || enter) { addSite(input.text.toString()); true } else false
        }
        input.setOnKeyListener { _, keyCode, event ->
            if (keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN && input.isFocused) {
                addSite(input.text.toString())
                true
            } else {
                false
            }
        }
    }

    private fun focusedSiteButton(): Pair<Int, Int>? {
        val list = findViewById<LinearLayout>(R.id.site_list)
        for (rowIndex in 0 until list.childCount) {
            val row = list.getChildAt(rowIndex) as? ViewGroup ?: continue
            for (childIndex in 0 until row.childCount) {
                if (row.getChildAt(childIndex).isFocused) return rowIndex to childIndex - 1
            }
        }
        return null
    }

    private fun renderSites(focusRow: Int? = null, focusButton: Int = 0) {
        val list = findViewById<LinearLayout>(R.id.site_list)
        list.removeAllViews()
        val entries = SiteList.all()
        var toFocus: View? = null
        entries.forEachIndexed { index, entry ->
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(8), 0, dp(4))
            }
            val label = TextView(this).apply {
                text = "${index + 1}. ${entry.origin}\n${kindLabel(entry.kind)}"
                setTextColor(ContextCompat.getColor(this@SettingsActivity, R.color.kpv_text_primary))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            }
            row.addView(label, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            val buttons = listOf(
                smallButton("▲") { update(SiteListCodec.move(SiteList.all(), index, -1), index - 1, BUTTON_UP) },
                smallButton("▼") { update(SiteListCodec.move(SiteList.all(), index, 1), index + 1, BUTTON_DOWN) },
                smallButton(getString(R.string.site_recheck)) { detectAndSave(entry.origin, fromInput = false) },
                smallButton(getString(R.string.site_remove)) {
                    if (SiteList.all().size <= 1) {
                        Toast.makeText(this, R.string.site_last, Toast.LENGTH_SHORT).show()
                    } else {
                        update(SiteListCodec.remove(SiteList.all(), index), index, BUTTON_REMOVE)
                    }
                },
            )
            buttons.forEach { row.addView(it) }
            list.addView(row)
            if (index == focusRow?.coerceAtMost(entries.lastIndex)) {
                toFocus = buttons[focusButton.coerceIn(0, buttons.lastIndex)]
            }
        }
        if (focusRow != null) (toFocus ?: findViewById<EditText>(R.id.site_origin)).requestFocus()
    }

    private fun addSite(raw: String) {
        val origin = SiteListCodec.normalize(raw)
        if (origin.isEmpty()) {
            Toast.makeText(this, R.string.settings_site_required, Toast.LENGTH_SHORT).show()
            return
        }
        getSystemService(InputMethodManager::class.java)
            ?.hideSoftInputFromWindow(findViewById<EditText>(R.id.site_origin).windowToken, 0)
        detectAndSave(origin, fromInput = true)
    }

    private fun detectAndSave(origin: String, fromInput: Boolean) {
        checkingOrigin?.let {
            Toast.makeText(this, getString(R.string.site_checking, it), Toast.LENGTH_SHORT).show()
            return
        }
        checkingOrigin = origin
        val add = findViewById<Button>(R.id.add_site)
        val addHadFocus = add.isFocused
        add.isEnabled = false
        Toast.makeText(this, getString(R.string.site_checking, origin), Toast.LENGTH_SHORT).show()
        Thread {
            val kind = runCatching { SiteKindDetector.detect(origin) }.getOrNull()
            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                checkingOrigin = null
                add.isEnabled = true
                if (addHadFocus) add.requestFocus()
                if (kind == null) {
                    Toast.makeText(this, getString(R.string.site_unrecognised, origin), Toast.LENGTH_LONG).show()
                    return@runOnUiThread
                }
                val next = SiteListCodec.add(SiteList.all(), SiteEntry(origin, kind))
                if (fromInput) {
                    update(next)
                    findViewById<EditText>(R.id.site_origin).setText("")
                    Toast.makeText(this, getString(R.string.site_added, origin, kindLabel(kind)), Toast.LENGTH_SHORT).show()
                } else {
                    update(next, next.indexOfFirst { it.origin == origin }, BUTTON_RECHECK)
                    Toast.makeText(this, getString(R.string.site_rechecked, origin, kindLabel(kind)), Toast.LENGTH_SHORT).show()
                }
            }
        }.start()
    }

    private fun update(list: List<SiteEntry>, focusRow: Int? = null, focusButton: Int = 0) {
        if (list == SiteList.all()) return
        SiteList.save(list)
        renderSites(focusRow, focusButton)
    }

    private fun kindLabel(kind: SiteKind) = getString(
        when (kind) {
            SiteKind.API -> R.string.site_kind_api
            SiteKind.EVENT_PAGES -> R.string.site_kind_event_pages
        },
    )

    private fun smallButton(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        minWidth = dp(56)
        setOnClickListener { onClick() }
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private companion object {
        const val KEY_START_TOP = "start_top_entry"
        const val BUTTON_UP = 0
        const val BUTTON_DOWN = 1
        const val BUTTON_RECHECK = 2
        const val BUTTON_REMOVE = 3
    }
}
