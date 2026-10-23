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
    private val horizontalPaddingPx = dp(if (television) 48 else 16)
    private val cardGapPx = dp(10)
    private val span = gridColumns()

    // TV cards fill their grid column; a fixed width overflows the column and covers the live dot.
    private val cardWidthPx = if (television) {
        (resources.displayMetrics.widthPixels - 2 * horizontalPaddingPx) / span - cardGapPx
    } else {
        dp(176)
    }
    private val posterHeightPx = if (television) cardWidthPx * 9 / 16 else dp(99)
    private val cardHeightPx = if (television) ViewGroup.LayoutParams.WRAP_CONTENT else posterHeightPx + dp(68)

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
        setPadding(horizontalPaddingPx, dp(if (television) 16 else 8), horizontalPaddingPx, dp(16))
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

    fun setLoadingStream(streamUri: String?) {
        browseAdapter.loadingStreamUri = streamUri
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
