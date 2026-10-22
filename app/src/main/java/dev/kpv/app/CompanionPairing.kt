package dev.kpv.app

import android.content.Context
import java.security.SecureRandom
import java.util.UUID

/** PIN pairing + bearer tokens for LAN companion (TV must pair before resolve/catalog). */
object CompanionPairing {

    private const val PREFS = "kpv_companion_pairing"
    private const val KEY_TOKENS = "tokens"
    private const val KEY_SESSION_PIN = "session_pin"
    private const val KEY_PIN_EXPIRES = "pin_expires_ms"
    private const val PIN_TTL_MS = 15 * 60 * 1000L
    private const val MAX_TOKENS = 5

    private lateinit var appContext: Context
    private val random = SecureRandom()

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    fun onCompanionStarted() {
        val pin = (100_000 + random.nextInt(900_000)).toString()
        val expires = System.currentTimeMillis() + PIN_TTL_MS
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_SESSION_PIN, pin)
            .putLong(KEY_PIN_EXPIRES, expires)
            .apply()
    }

    fun onCompanionStopped() {
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove(KEY_SESSION_PIN)
            .remove(KEY_PIN_EXPIRES)
            .apply()
    }

    fun currentPin(): String? {
        val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val pin = prefs.getString(KEY_SESSION_PIN, null) ?: return null
        if (System.currentTimeMillis() > prefs.getLong(KEY_PIN_EXPIRES, 0L)) {
            prefs.edit().remove(KEY_SESSION_PIN).remove(KEY_PIN_EXPIRES).apply()
            return null
        }
        return pin
    }

    fun pairWithPin(pin: String, deviceLabel: String): String? {
        val expected = currentPin() ?: return null
        if (pin.trim() != expected) return null
        val token = UUID.randomUUID().toString()
        val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val existing = prefs.getStringSet(KEY_TOKENS, emptySet())?.toMutableSet() ?: mutableSetOf()
        existing += token
        while (existing.size > MAX_TOKENS) {
            existing.remove(existing.first())
        }
        prefs.edit()
            .putStringSet(KEY_TOKENS, existing)
            .apply()
        return token
    }

    fun isValidToken(token: String?): Boolean {
        if (token.isNullOrBlank()) return false
        val set = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getStringSet(KEY_TOKENS, emptySet()) ?: return false
        return set.contains(token.trim())
    }

    fun revokeAllTokens() {
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove(KEY_TOKENS)
            .apply()
    }

    fun pairedDeviceCount(): Int =
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getStringSet(KEY_TOKENS, emptySet())?.size ?: 0
}
