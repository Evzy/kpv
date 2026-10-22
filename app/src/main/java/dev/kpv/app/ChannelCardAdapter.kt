package dev.kpv.app

import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView

class ChannelCardAdapter(
    private val cardWidthPx: Int,
    private val cardHeightPx: Int,
    private val posterHeightPx: Int,
    private val onClick: (ChannelListing) -> Unit,
) : ListAdapter<ChannelListing, ChannelCardAdapter.Holder>(Diff) {

    var loadingStreamUri: String? = null
        set(value) {
            if (field == value) return
            field = value
            notifyDataSetChanged()
        }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val view = StreamCardBinder.inflate(parent)
        view.layoutParams = RecyclerView.LayoutParams(cardWidthPx, cardHeightPx)
        view.findViewById<android.view.View>(R.id.poster).layoutParams.height = posterHeightPx
        return Holder(view)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val channel = getItem(position)
        StreamCardBinder.bind(
            holder.itemView,
            channel,
            cardWidthPx,
            posterHeightPx,
            onClick,
            loading = channel.streamUri == loadingStreamUri,
        )
    }

    override fun onViewRecycled(holder: Holder) {
        StreamCardBinder.clearPoster(holder.itemView)
    }

    class Holder(view: android.view.View) : RecyclerView.ViewHolder(view)

    private object Diff : DiffUtil.ItemCallback<ChannelListing>() {
        override fun areItemsTheSame(a: ChannelListing, b: ChannelListing) = a.streamUri == b.streamUri
        override fun areContentsTheSame(a: ChannelListing, b: ChannelListing) = a == b
    }
}
