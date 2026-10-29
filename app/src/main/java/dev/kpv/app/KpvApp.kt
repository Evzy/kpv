package dev.kpv.app

import android.app.Application
import android.graphics.Bitmap
import com.bumptech.glide.Glide
import com.bumptech.glide.Registry
import dev.kpv.app.sites.SiteList
import java.io.InputStream

class KpvApp : Application() {
    override fun onCreate() {
        super.onCreate()
        SiteList.init(this)
        SiteConfig.init(this)
        val glide = Glide.get(this)
        glide.registry.prepend(
            Registry.BUCKET_BITMAP,
            InputStream::class.java,
            Bitmap::class.java,
            SvgBitmapDecoder(glide.bitmapPool),
        )
    }
}
