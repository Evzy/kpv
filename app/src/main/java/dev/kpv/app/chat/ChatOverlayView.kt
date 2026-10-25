package dev.kpv.app.chat

import android.animation.LayoutTransition
import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextUtils
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import dev.kpv.app.R

/** Live-style chat: lines rise from the bottom-end corner, at most [MAX_VISIBLE] at once, each fading out. */
class ChatOverlayView(context: Context, private val television: Boolean) : LinearLayout(context) {

    private val pending = ArrayDeque<ChatMessage>()
    private var pumping = false
    private val density = resources.displayMetrics.density

    private val pump = object : Runnable {
        override fun run() {
            val next = pending.removeFirstOrNull()
            if (next == null) {
                pumping = false
                return
            }
            show(next)
            postDelayed(this, PACE_MS)
        }
    }

    init {
        orientation = VERTICAL
        gravity = Gravity.BOTTOM or Gravity.END
        isFocusable = false
        clipChildren = false
        clipToPadding = false
        layoutTransition = LayoutTransition().apply {
            val rise = PropertyValuesHolder.ofFloat(View.TRANSLATION_Y, 24 * density, 0f)
            val fadeIn = PropertyValuesHolder.ofFloat(View.ALPHA, 0f, 1f)
            setAnimator(LayoutTransition.APPEARING, ObjectAnimator.ofPropertyValuesHolder(null as Any?, rise, fadeIn))
            setAnimator(LayoutTransition.DISAPPEARING, ObjectAnimator.ofFloat(null as View?, View.ALPHA, 1f, 0f))
            setDuration(ANIM_MS)
            setStartDelay(LayoutTransition.APPEARING, 0)
            setStartDelay(LayoutTransition.CHANGE_DISAPPEARING, 0)
        }
    }

    fun add(messages: List<ChatMessage>) {
        pending.addAll(messages)
        while (pending.size > MAX_PENDING) pending.removeFirst()
        if (!pumping) {
            pumping = true
            post(pump)
        }
    }

    fun clear() {
        removeCallbacks(pump)
        pumping = false
        pending.clear()
        for (i in 0 until childCount) (getChildAt(i).tag as? Runnable)?.let(::removeCallbacks)
        val transition = layoutTransition
        layoutTransition = null
        removeAllViews()
        layoutTransition = transition
    }

    override fun onDetachedFromWindow() {
        clear()
        super.onDetachedFromWindow()
    }

    private fun show(message: ChatMessage) {
        val line = TextView(context).apply {
            text = format(message)
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, if (television) 16f else 13f)
            maxLines = 3
            ellipsize = TextUtils.TruncateAt.END
            setBackgroundResource(R.drawable.bg_chat_bubble)
            val h = (10 * density).toInt()
            val v = (6 * density).toInt()
            setPadding(h, v, h, v)
            setShadowLayer(2f, 0f, 1f, Color.BLACK)
        }
        val params = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
            topMargin = (6 * density).toInt()
        }
        if (childCount >= MAX_VISIBLE) {
            (getChildAt(0).tag as? Runnable)?.let(::removeCallbacks)
            removeViewAt(0)
        }
        addView(line, params)
        val expire = Runnable { if (line.parent === this) removeView(line) }
        line.tag = expire
        postDelayed(expire, LIFETIME_MS)
    }

    private fun format(message: ChatMessage): CharSequence {
        val builder = SpannableStringBuilder(message.username)
        val nameEnd = builder.length
        builder.setSpan(StyleSpan(Typeface.BOLD), 0, nameEnd, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        builder.setSpan(
            ForegroundColorSpan(message.color ?: DEFAULT_NAME_COLOUR),
            0,
            nameEnd,
            Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
        )
        builder.append("  ").append(message.text)
        return builder
    }

    private companion object {
        const val MAX_VISIBLE = 5
        const val MAX_PENDING = 20
        const val PACE_MS = 350L
        const val LIFETIME_MS = 8_000L
        const val ANIM_MS = 220L
        val DEFAULT_NAME_COLOUR = Color.parseColor("#93C5FD")
    }
}
