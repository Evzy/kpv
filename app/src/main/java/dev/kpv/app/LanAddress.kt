package dev.kpv.app

import java.net.Inet4Address
import java.net.NetworkInterface

object LanAddress {
    fun primaryIpv4(): String? {
        val interfaces = NetworkInterface.getNetworkInterfaces() ?: return null
        for (iface in interfaces.toList()) {
            if (!iface.isUp || iface.isLoopback) continue
            for (addr in iface.inetAddresses.toList()) {
                if (addr.isLoopbackAddress || addr !is Inet4Address) continue
                val host = addr.hostAddress ?: continue
                if (host.startsWith("169.254.")) continue
                return host
            }
        }
        return null
    }
}
