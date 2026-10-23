package dev.kpv.app

import android.util.TypedValue
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

class CatalogBrowseAdapter(
    private val television: Boolean,
    private val cardWidthPx: Int,
    private val cardHeightPx: Int,
    private val posterHeightPx: Int,
    private val cardGapPx: Int,
    private val onChannelClick: (ChannelListing) -> Unit,
    private val onHeaderClick: (String) -> Unit,
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    private val rowPool = RecyclerView.RecycledViewPool()
    private var items: List<BrowseItem> = emptyList()
    var loadingStreamUri: String? = null
        set(value) {
            if (field == value) return
            field = value
            notifyDataSetChanged()
        }

    fun submitItems(newItems: List<BrowseItem>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun getItemViewType(position: Int): Int = when (items[position]) {
        is BrowseItem.Header -> TYPE_HEADER
        is BrowseItem.Row -> TYPE_ROW
        is BrowseItem.Channel -> TYPE_CHANNEL
    }

    override fun getItemCount() = items.size

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder =
        when (viewType) {
            TYPE_HEADER -> HeaderHolder(
                LayoutInflater.from(parent.context).inflate(R.layout.item_browse_header, parent, false),
            )
            TYPE_ROW -> RowHolder(
                LayoutInflater.from(parent.context).inflate(R.layout.item_browse_row, parent, false),
                rowPool,
                cardWidthPx,
                cardHeightPx,
                posterHeightPx,
                cardGapPx,
                onChannelClick,
            )
            else -> ChannelHolder(
                StreamCardBinder.inflate(parent).apply {
                    layoutParams = RecyclerView.LayoutParams(cardWidthPx, cardHeightPx)
                    findViewById<View>(R.id.poster).layoutParams.height = posterHeightPx
                },
            )
        }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (val item = items[position]) {
            is BrowseItem.Header -> (holder as HeaderHolder).bind(item, onHeaderClick)
            is BrowseItem.Row -> (holder as RowHolder).bind(item.channels, loadingStreamUri)
            is BrowseItem.Channel -> StreamCardBinder.bind(
                holder.itemView,
                item.listing,
                cardWidthPx,
                posterHeightPx,
                onChannelClick,
                loading = item.listing.streamUri == loadingStreamUri,
            )
        }
    }

    override fun onViewRecycled(holder: RecyclerView.ViewHolder) {
        if (holder is ChannelHolder) StreamCardBinder.clearPoster(holder.itemView)
    }

    class HeaderHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val title = view.findViewById<TextView>(R.id.title)
        private val chevron = view.findViewById<View>(R.id.chevron)

        private val density = view.resources.displayMetrics.density

        fun bind(header: BrowseItem.Header, onClick: (String) -> Unit) {
            title.text = header.title
            val league = header.level > 0
            title.setTextSize(TypedValue.COMPLEX_UNIT_SP, if (league) 17f else 22f)
            title.setTextColor(
                ContextCompat.getColor(
                    itemView.context,
                    if (league) R.color.kpv_text_secondary else R.color.kpv_text_primary,
                ),
            )
            itemView.setPaddingRelative(
                ((if (league) 20 else 4) * density).toInt(),
                itemView.paddingTop,
                itemView.paddingEnd,
                itemView.paddingBottom,
            )
            chevron.scaleX = if (league) 0.75f else 1f
            chevron.scaleY = chevron.scaleX
            chevron.rotation = if (header.collapsed) 0f else 180f
            itemView.contentDescription = itemView.context.getString(
                if (header.collapsed) R.string.category_expand else R.string.category_collapse,
                header.title,
            )
            itemView.setOnClickListener { onClick(header.key) }
        }
    }

    class ChannelHolder(view: View) : RecyclerView.ViewHolder(view)

    class RowHolder(
        view: View,
        pool: RecyclerView.RecycledViewPool,
        cardWidthPx: Int,
        cardHeightPx: Int,
        posterHeightPx: Int,
        cardGapPx: Int,
        onClick: (ChannelListing) -> Unit,
    ) : RecyclerView.ViewHolder(view) {

        private val row = view.findViewById<RecyclerView>(R.id.channel_row)
        private val adapter = ChannelCardAdapter(cardWidthPx, cardHeightPx, posterHeightPx, onClick)

        init {
            row.apply {
                layoutManager = LinearLayoutManager(context, LinearLayoutManager.HORIZONTAL, false)
                setRecycledViewPool(pool)
                isNestedScrollingEnabled = false
                setHasFixedSize(true)
                adapter = this@RowHolder.adapter
                if (itemDecorationCount == 0) {
                    addItemDecoration(HorizontalGapDecoration(cardGapPx))
                }
            }
        }

        fun bind(channels: List<ChannelListing>, loadingUri: String?) {
            adapter.loadingStreamUri = loadingUri
            adapter.submitList(channels)
        }
    }

    companion object {
        const val TYPE_HEADER = 0
        private const val TYPE_ROW = 1
        private const val TYPE_CHANNEL = 2
    }
}
