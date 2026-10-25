package dev.kpv.app.unlock

import java.security.MessageDigest

/** Offline per-device unlock: unlock code = device code + key, digit by digit, without carry. */
object UnlockCode {

    const val LENGTH = 6

    fun deviceCode(id: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest("kpv-unlock:$id".toByteArray())
        var value = 0L
        for (i in 0 until 8) value = (value shl 8) or (digest[i].toLong() and 0xFF)
        return java.lang.Long.remainderUnsigned(value, 1_000_000L).toString().padStart(LENGTH, '0')
    }

    fun unlockCode(deviceCode: String, key: String): String =
        deviceCode.zip(key) { d, k -> '0' + (d.digitToInt() + k.digitToInt()) % 10 }.joinToString("")

    fun matches(input: String, deviceCode: String, key: String): Boolean {
        val digits = input.filterNot { it == ' ' || it == '-' }
        return digits.length == LENGTH && digits.all(Char::isDigit) && digits == unlockCode(deviceCode, key)
    }
}
