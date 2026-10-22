package dev.kpv.app

import android.app.Application

class KpvApp : Application() {
    override fun onCreate() {
        super.onCreate()
        SiteConfig.init(this)
    }
}
