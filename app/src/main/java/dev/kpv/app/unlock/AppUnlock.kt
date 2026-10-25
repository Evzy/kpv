package dev.kpv.app.unlock

import android.annotation.SuppressLint
import android.content.Context
import android.provider.Settings
import java.util.UUID

/** Stores the entered unlock code and re-checks it against this device and the current key. */
object AppUnlock {

    /** Changing this in a release locks every device until it gets a new code. */
    private const val KEY = "457141"

    private const val PREFS = "kpv_unlock"
    private const val KEY_CODE = "unlock_code"
    private const val KEY_FALLBACK_ID = "fallback_id"

    fun deviceCode(context: Context): String = UnlockCode.deviceCode(deviceId(context))

    fun isUnlocked(context: Context): Boolean {
        val stored = prefs(context).getString(KEY_CODE, null) ?: return false
        return UnlockCode.matches(stored, deviceCode(context), KEY)
    }

    fun tryUnlock(context: Context, input: String): Boolean {
        if (!UnlockCode.matches(input, deviceCode(context), KEY)) return false
        prefs(context).edit().putString(KEY_CODE, input.filter(Char::isDigit)).apply()
        return true
    }

    @SuppressLint("HardwareIds")
    private fun deviceId(context: Context): String {
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        if (!androidId.isNullOrBlank()) return androidId
        val prefs = prefs(context)
        return prefs.getString(KEY_FALLBACK_ID, null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString(KEY_FALLBACK_ID, it).apply()
        }
    }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
