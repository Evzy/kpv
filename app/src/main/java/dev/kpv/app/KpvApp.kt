package dev.kpv.app

import android.app.Application
import dev.kpv.app.sites.SiteList

class KpvApp : Application() {
    override fun onCreate() {
        super.onCreate()
        SiteList.init(this)
        SiteConfig.init(this)
    }
}
