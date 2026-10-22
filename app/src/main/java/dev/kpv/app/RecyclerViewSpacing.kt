package dev.kpv.app

import android.graphics.Rect
import android.view.View
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView

/** Even gaps between horizontal channel cards. */
class HorizontalGapDecoration(
    private val gapPx: Int,
    private val edgePx: Int = gapPx,
) : RecyclerView.ItemDecoration() {
    override fun getItemOffsets(outRect: Rect, view: View, parent: RecyclerView, state: RecyclerView.State) {
        val position = parent.getChildAdapterPosition(view)
        if (position == RecyclerView.NO_POSITION) return
        val last = (parent.adapter?.itemCount ?: 0) - 1
        outRect.left = if (position == 0) edgePx else 0
        outRect.right = if (position == last) edgePx else gapPx
    }
}

/** Even gaps between grid channel tiles (TV). */
class GridGapDecoration(
    private val spanCount: Int,
    private val gapPx: Int,
) : RecyclerView.ItemDecoration() {
    override fun getItemOffsets(outRect: Rect, view: View, parent: RecyclerView, state: RecyclerView.State) {
        val position = parent.getChildAdapterPosition(view)
        if (position == RecyclerView.NO_POSITION) return
        val lp = view.layoutParams as? GridLayoutManager.LayoutParams ?: return
        if (lp.spanSize != 1) return
        val column = lp.spanIndex
        outRect.left = gapPx - column * gapPx / spanCount
        outRect.right = (column + 1) * gapPx / spanCount
        outRect.bottom = gapPx
    }
}
