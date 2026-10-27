package dev.kpv.app

import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.updatePadding

/** Settings → Customize categories: hide Live now; reorder and hide sports and their leagues. */
class CategoryEditorActivity : AppCompatActivity() {

    private lateinit var list: LinearLayout
    private var sports: List<CategoryLayout.Sport> = emptyList()
    private var prefs = CategoryLayout.Prefs()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        TvHelper.applyScreenOrientation(this)
        PhoneSystemBars.enableEdgeToEdge(this)

        sports = CategoryPrefsStore.loadKnown(this)
        prefs = CategoryPrefsStore.load(this)

        list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(24), dp(24), dp(24))
        }
        val scroll = ScrollView(this).apply {
            setBackgroundColor(color(R.color.kpv_bg))
            addView(list)
        }
        setContentView(scroll)
        if (!TvHelper.isTelevision(this)) {
            PhoneSystemBars.listen(this, scroll) { insets, view ->
                val bars = PhoneSystemBars.systemBarInsets(insets)
                view.updatePadding(left = bars.left, top = bars.top, right = bars.right, bottom = bars.bottom)
            }
        }
        render(focusKey = null, focusButton = 0)
    }

    private fun render(focusKey: String?, focusButton: Int) {
        list.removeAllViews()
        list.addView(text(getString(R.string.customize_categories), 24f, bold = true).apply {
            setPadding(0, 0, 0, dp(8))
        })
        list.addView(text(getString(R.string.customize_categories_hint), 14f, secondary = true).apply {
            setPadding(0, 0, 0, dp(16))
        })
        val reset = Button(this).apply {
            text = getString(R.string.customize_categories_reset)
            setOnClickListener {
                CategoryPrefsStore.reset(this@CategoryEditorActivity)
                prefs = CategoryLayout.Prefs()
                render(focusKey = RESET_KEY, focusButton = 0)
            }
        }
        list.addView(reset, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        if (sports.isEmpty()) {
            list.addView(text(getString(R.string.customize_categories_empty), 14f, secondary = true).apply {
                setPadding(0, dp(16), 0, 0)
            })
        }

        var toFocus: View? = if (focusKey == RESET_KEY) reset else null
        for (row in CategoryLayout.editorRows(sports, prefs)) {
            val buttons = rowButtons(row)
            list.addView(rowView(row, buttons))
            if (row.key == focusKey) toFocus = buttons[focusButton.coerceIn(0, buttons.lastIndex)]
        }
        (toFocus ?: reset).requestFocus()
    }

    private fun rowButtons(row: CategoryLayout.EditorRow): List<Button> {
        val hide = smallButton(getString(if (row.hidden) R.string.customize_show else R.string.customize_hide)) {
            update(CategoryLayout.toggleHidden(prefs, row.key), row.key, 0)
        }
        if (row.kind == CategoryLayout.Kind.LIVE_NOW) return listOf(hide)
        val up = smallButton("▲") { move(row, -1, 1) }
        val down = smallButton("▼") { move(row, 1, 2) }
        return listOf(hide, up, down)
    }

    private fun move(row: CategoryLayout.EditorRow, dir: Int, button: Int) {
        val next = when (row.kind) {
            CategoryLayout.Kind.LIVE_NOW -> prefs
            CategoryLayout.Kind.SPORT -> CategoryLayout.moveSport(sports, prefs, row.sport, dir)
            CategoryLayout.Kind.LEAGUE -> CategoryLayout.moveLeague(sports, prefs, row.sport, row.league!!, dir)
        }
        update(next, row.key, button)
    }

    private fun update(next: CategoryLayout.Prefs, key: String, button: Int) {
        if (next == prefs) return
        prefs = next
        CategoryPrefsStore.save(this, prefs)
        render(focusKey = key, focusButton = button)
    }

    private fun rowView(row: CategoryLayout.EditorRow, buttons: List<Button>): View {
        val league = row.kind == CategoryLayout.Kind.LEAGUE
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(if (league) dp(28) else 0, dp(if (league) 2 else 12), 0, dp(2))
            val label = text(row.label, if (league) 16f else 20f, bold = !league, secondary = row.hidden)
            if (row.hidden) label.alpha = 0.6f
            addView(label, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            buttons.forEach { addView(it) }
        }
    }

    private fun smallButton(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        minWidth = dp(64)
        setOnClickListener { onClick() }
    }

    private fun text(value: String, sp: Float, bold: Boolean = false, secondary: Boolean = false) =
        TextView(this).apply {
            text = value
            setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
            setTextColor(color(if (secondary) R.color.kpv_text_secondary else R.color.kpv_text_primary))
            if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
        }

    private fun color(id: Int) = ContextCompat.getColor(this, id)

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private companion object {
        const val RESET_KEY = "\u0000reset"
    }
}
