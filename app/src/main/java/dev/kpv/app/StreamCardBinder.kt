package dev.kpv.app

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy

object StreamCardBinder {

    fun inflate(parent: ViewGroup): View =
        LayoutInflater.from(parent.context).inflate(R.layout.item_stream_card, parent, false)

    fun bind(
        view: View,
        channel: ChannelListing,
        posterWidthPx: Int,
        posterHeightPx: Int,
        onClick: (ChannelListing) -> Unit,
    ) {
        view.findViewById<TextView>(R.id.title).text = channel.title
        view.findViewById<TextView>(R.id.tag).text = channel.tag.ifBlank { "Live" }
        view.findViewById<View>(R.id.live_indicator).visibility =
            if (channel.isLive) View.VISIBLE else View.GONE
        val poster = view.findViewById<ImageView>(R.id.poster)
        if (channel.posterUrl.isBlank()) {
            Glide.with(view).clear(poster)
            poster.setImageDrawable(null)
        } else {
            Glide.with(view)
                .load(channel.posterUrl)
                .override(posterWidthPx, posterHeightPx)
                .diskCacheStrategy(DiskCacheStrategy.ALL)
                .placeholder(R.drawable.poster_placeholder)
                .centerCrop()
                .into(poster)
        }
        view.setOnClickListener { onClick(channel) }
    }

    fun clearPoster(view: View) {
        Glide.with(view).clear(view.findViewById<ImageView>(R.id.poster))
    }
}
