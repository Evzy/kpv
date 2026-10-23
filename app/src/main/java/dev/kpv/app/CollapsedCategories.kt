package dev.kpv.app

import android.content.Context

/** Category names the user has collapsed on the home screen; persisted across launches. */
object CollapsedCategories {

    private const val PREFS = "kpv_browse"
    private const val KEY_COLLAPSED = "collapsed_categories"

    fun load(context: Context): Set<String> =
        prefs(context).getStringSet(KEY_COLLAPSED, null)?.toSet().orEmpty()

    fun toggle(context: Context, category: String): Set<String> {
        val next = load(context).toMutableSet()
        if (!next.remove(category)) next += category
        prefs(context).edit().putStringSet(KEY_COLLAPSED, next).apply()
        return next
    }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
