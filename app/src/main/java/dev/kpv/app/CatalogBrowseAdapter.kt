package dev.kpv.app

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

class CatalogBrowseAdapter(
    private val television: Boolean,
    private val cardWidthPx: Int,
    private val cardHeightPx: Int,
    private val posterHeightPx: Int,
    private val cardGapPx: Int,
    private val onChannelClick: (ChannelListing) -> Unit,
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    private val rowPool = RecyclerView.RecycledViewPool()
    private var items: List<BrowseItem> = emptyList()

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
            is BrowseItem.Header -> (holder as HeaderHolder).bind(item.title)
            is BrowseItem.Row -> (holder as RowHolder).bind(item.channels)
            is BrowseItem.Channel -> StreamCardBinder.bind(
                holder.itemView,
                item.listing,
                cardWidthPx,
                posterHeightPx,
                onChannelClick,
            )
        }
    }

    override fun onViewRecycled(holder: RecyclerView.ViewHolder) {
        if (holder is ChannelHolder) StreamCardBinder.clearPoster(holder.itemView)
    }

    class HeaderHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val title = view.findViewById<TextView>(R.id.title)
        fun bind(text: String) {
            title.text = text
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

        fun bind(channels: List<ChannelListing>) {
            adapter.submitList(channels)
        }
    }

    companion object {
        const val TYPE_HEADER = 0
        private const val TYPE_ROW = 1
        private const val TYPE_CHANNEL = 2
    }
}
