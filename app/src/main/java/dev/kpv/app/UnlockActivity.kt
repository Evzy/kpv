package dev.kpv.app

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.updatePadding
import dev.kpv.app.unlock.AppUnlock

/** One-time per-device unlock gate shown before the catalog. */
class UnlockActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        TvHelper.applyScreenOrientation(this)
        PhoneSystemBars.enableEdgeToEdge(this)
        setContentView(R.layout.activity_unlock)

        val scroll = findViewById<ScrollView>(R.id.unlock_scroll)
        PhoneSystemBars.listen(this, scroll) { insets, view ->
            val bars = PhoneSystemBars.systemBarInsets(insets)
            view.updatePadding(left = bars.left, top = bars.top, right = bars.right, bottom = bars.bottom)
        }
        if (TvHelper.isTelevision(this)) {
            val form = findViewById<View>(R.id.unlock_form)
            form.layoutParams = form.layoutParams.apply {
                width = (560 * resources.displayMetrics.density).toInt()
            }
        }

        val code = AppUnlock.deviceCode(this)
        findViewById<TextView>(R.id.device_code).text =
            getString(R.string.unlock_device_code, "${code.take(3)} ${code.drop(3)}")

        val input = findViewById<EditText>(R.id.unlock_code)
        val error = findViewById<TextView>(R.id.unlock_error)
        val submit = {
            if (AppUnlock.tryUnlock(this, input.text.toString())) {
                startActivity(Intent(this, MainActivity::class.java))
                finish()
            } else {
                error.visibility = View.VISIBLE
            }
        }
        input.setOnEditorActionListener { _, actionId, event ->
            val done = (actionId and EditorInfo.IME_MASK_ACTION) == EditorInfo.IME_ACTION_DONE
            val enter = event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN
            if (done || enter) {
                submit()
                true
            } else {
                false
            }
        }
        findViewById<Button>(R.id.unlock).setOnClickListener { submit() }
        input.requestFocus()
    }
}
