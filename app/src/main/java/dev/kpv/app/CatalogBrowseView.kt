package dev.kpv.app

import android.content.Context
import android.util.TypedValue
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import com.bumptech.glide.Glide
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

class CatalogBrowseView(
    context: Context,
    private val onChannelClick: (ChannelListing) -> Unit,
) : RecyclerView(context) {

    private val television = TvHelper.isTelevision(context)
    private val cardWidthPx = dp(if (television) 200 else 176)
    private val posterHeightPx = dp(if (television) 112 else 99)
    private val cardHeightPx = posterHeightPx + dp(68)
    private val cardGapPx = dp(10)

    private val browseAdapter = CatalogBrowseAdapter(
        television = television,
        cardWidthPx = cardWidthPx,
        cardHeightPx = cardHeightPx,
        posterHeightPx = posterHeightPx,
        cardGapPx = cardGapPx,
        onChannelClick = onChannelClick,
    )

    init {
        setBackgroundColor(ContextCompat.getColor(context, R.color.kpv_bg))
        setPadding(dp(if (television) 48 else 16), dp(if (television) 16 else 8), dp(if (television) 48 else 16), dp(16))
        clipToPadding = false
        setHasFixedSize(true)
        itemAnimator = null
        adapter = browseAdapter
        addOnScrollListener(object : OnScrollListener() {
            override fun onScrollStateChanged(recyclerView: RecyclerView, newState: Int) {
                val glide = Glide.with(context)
                if (newState == SCROLL_STATE_SETTLING || newState == SCROLL_STATE_DRAGGING) {
                    glide.pauseRequests()
                } else {
                    glide.resumeRequests()
                }
            }
        })

        if (television) {
            val span = gridColumns()
            layoutManager = GridLayoutManager(context, span).apply {
                spanSizeLookup = object : GridLayoutManager.SpanSizeLookup() {
                    override fun getSpanSize(position: Int): Int =
                        if (browseAdapter.getItemViewType(position) == CatalogBrowseAdapter.TYPE_HEADER) span else 1
                }
            }
            addItemDecoration(GridGapDecoration(span, cardGapPx))
        } else {
            layoutManager = LinearLayoutManager(context)
        }
    }

    fun setItems(items: List<BrowseItem>) {
        browseAdapter.submitItems(items)
    }

    private fun gridColumns(): Int {
        val widthDp = resources.configuration.screenWidthDp
        return when {
            widthDp >= 1200 -> 6
            widthDp >= 900 -> 5
            widthDp >= 600 -> 4
            else -> 3
        }
    }

    private fun dp(value: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()
}
