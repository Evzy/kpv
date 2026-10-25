package dev.kpv.app.chat

import org.json.JSONObject

/** Turns site chat WebSocket frames into displayable lines. */
object ChatMessageParser {

    const val PREFILL_LIMIT = 5

    private val TAG = Regex("<[^>]*>")
    private val NUMERIC_ENTITY = Regex("&#(\\d+);")
    private val WHITESPACE = Regex("\\s+")
    private val HEX_COLOUR = Regex("[0-9a-fA-F]{6}")

    fun parse(frame: String): List<ChatMessage> {
        val root = runCatching { JSONObject(frame) }.getOrNull() ?: return emptyList()
        val prefill = root.optJSONArray("prefill")
        if (prefill != null) {
            val messages = ArrayList<ChatMessage>(prefill.length())
            for (i in 0 until prefill.length()) {
                prefill.optJSONObject(i)?.let(::toMessage)?.let(messages::add)
            }
            return messages.takeLast(PREFILL_LIMIT)
        }
        return listOfNotNull(toMessage(root))
    }

    fun plainText(html: String): String {
        val noTags = html.replace(TAG, " ")
        val decoded = NUMERIC_ENTITY.replace(noTags) { match ->
            match.groupValues[1].toIntOrNull()?.let { String(Character.toChars(it)) } ?: match.value
        }
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&apos;", "'")
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
        return decoded.replace(WHITESPACE, " ").trim()
    }

    private fun toMessage(obj: JSONObject): ChatMessage? {
        if (!obj.has("message") || obj.optInt("private", 0) == 1) return null
        val username = obj.optString("username").trim()
        val text = plainText(obj.optString("message"))
        if (username.isEmpty() || text.isEmpty()) return null
        val id = obj.optString("uuid").ifEmpty { "$username:${text.hashCode()}" }
        return ChatMessage(id, username, text, parseColour(obj.optString("color")))
    }

    private fun parseColour(raw: String): Int? {
        val hex = raw.trim().removePrefix("#")
        if (!HEX_COLOUR.matches(hex)) return null
        return (0xFF000000 or hex.toLong(16)).toInt()
    }
}
