package dev.kpv.app

import fi.iki.elonen.NanoHTTPD

object TvCompanion {

    private const val DEFAULT_PORT = 8765

    private val resolveQueue = CompanionResolveQueue()
    private var server: TvCompanionServer? = null

    fun bindHost(host: CompanionHost?) {
        resolveQueue.bindHost(host)
    }

    /** @param allowPreview When true (Settings UI), start LAN + PIN even before Save. */
    fun startIfEnabled(allowPreview: Boolean = false): String? {
        if (!SiteConfig.isCompanionEnabled() && !allowPreview) {
            stop()
            return null
        }
        if (server != null) return baseUrl()
        CompanionPairing.onCompanionStarted()
        return runCatching {
            val port = SiteConfig.companionPort()
            val s = TvCompanionServer(port, resolveQueue)
            s.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)
            server = s
            baseUrl()
        }.getOrElse {
            CompanionPairing.onCompanionStopped()
            null
        }
    }

    fun stop() {
        resolveQueue.cancelAll()
        server?.shutdownServer()
        server = null
        CompanionPairing.onCompanionStopped()
    }

    fun baseUrl(): String? {
        val ip = LanAddress.primaryIpv4() ?: return null
        val port = server?.listeningPort ?: SiteConfig.companionPort()
        return "http://$ip:$port"
    }

    fun defaultPort(): Int = DEFAULT_PORT

    fun pairingPin(): String? = CompanionPairing.currentPin()
}
