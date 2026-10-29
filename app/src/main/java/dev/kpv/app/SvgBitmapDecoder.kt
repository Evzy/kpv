package dev.kpv.app

import android.graphics.Bitmap
import android.graphics.Canvas
import com.bumptech.glide.load.Options
import com.bumptech.glide.load.ResourceDecoder
import com.bumptech.glide.load.engine.Resource
import com.bumptech.glide.load.engine.bitmap_recycle.BitmapPool
import com.bumptech.glide.load.resource.bitmap.BitmapResource
import com.bumptech.glide.request.target.Target
import com.caverock.androidsvg.RenderOptions
import com.caverock.androidsvg.SVG
import java.io.InputStream
import kotlin.math.max
import kotlin.math.roundToInt

/** Renders SVG posters to bitmaps so Glide's usual crop and cache pipeline applies to them. */
class SvgBitmapDecoder(private val pool: BitmapPool) : ResourceDecoder<InputStream, Bitmap> {

    override fun handles(source: InputStream, options: Options): Boolean {
        source.mark(SNIFF_BYTES)
        val head = try {
            val buffer = ByteArray(SNIFF_BYTES)
            String(buffer, 0, max(0, source.read(buffer)), Charsets.UTF_8)
        } finally {
            source.reset()
        }
        return head.contains("<svg", ignoreCase = true)
    }

    override fun decode(source: InputStream, width: Int, height: Int, options: Options): Resource<Bitmap>? {
        val svg = SVG.getFromInputStream(source)
        val docWidth = svg.documentWidth.takeIf { it > 0 } ?: svg.documentViewBox?.width() ?: DEFAULT_SIZE
        val docHeight = svg.documentHeight.takeIf { it > 0 } ?: svg.documentViewBox?.height() ?: DEFAULT_SIZE
        if (svg.documentViewBox == null) svg.setDocumentViewBox(0f, 0f, docWidth, docHeight)
        val scale = if (width == Target.SIZE_ORIGINAL || height == Target.SIZE_ORIGINAL) {
            1f
        } else {
            max(width / docWidth, height / docHeight)
        }
        val bitmapWidth = (docWidth * scale).roundToInt().coerceIn(1, MAX_SIDE)
        val bitmapHeight = (docHeight * scale).roundToInt().coerceIn(1, MAX_SIDE)
        val bitmap = pool.get(bitmapWidth, bitmapHeight, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(0)
        svg.renderToCanvas(
            Canvas(bitmap),
            RenderOptions.create().viewPort(0f, 0f, bitmapWidth.toFloat(), bitmapHeight.toFloat()),
        )
        return BitmapResource.obtain(bitmap, pool)
    }

    private companion object {
        const val SNIFF_BYTES = 512
        const val DEFAULT_SIZE = 512f
        const val MAX_SIDE = 2048
    }
}
