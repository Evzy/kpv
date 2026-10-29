package dev.kpv.app.chat

/** Parses Twitch chat (IRC over WebSocket) lines and finds Twitch chat embeds in page markup. */
object TwitchIrc {

    const val SOCKET_URL = "wss://irc-ws.chat.twitch.tv:443"

    private val PRIVMSG = Regex("^(?:@(\\S+) )?:([^!\\s]+)!\\S+ PRIVMSG #\\S+ :(.*)$")
    private val EMBED = Regex("twitch\\.tv/embed/([A-Za-z0-9_]{3,25})/chat", RegexOption.IGNORE_CASE)
    private val HEX_COLOUR = Regex("#?([0-9a-fA-F]{6})")
    private val ACTION = Regex("^\u0001ACTION (.*)\u0001$")

    fun findChannel(html: String): String? = EMBED.find(html)?.groupValues?.get(1)?.lowercase()

    fun parseLine(line: String): ChatMessage? {
        val match = PRIVMSG.find(line.trimEnd('\r', '\n')) ?: return null
        val tags = parseTags(match.groupValues[1])
        val login = match.groupValues[2]
        val raw = match.groupValues[3]
        val text = (ACTION.find(raw)?.groupValues?.get(1) ?: raw).trim()
        if (text.isEmpty()) return null
        val username = tags["display-name"]?.takeIf { it.isNotBlank() } ?: login
        val id = tags["id"]?.takeIf { it.isNotEmpty() } ?: "$login:${text.hashCode()}"
        val color = tags["color"]?.let { HEX_COLOUR.matchEntire(it) }?.groupValues?.get(1)
            ?.let { (0xFF000000 or it.toLong(16)).toInt() }
        return ChatMessage(id, username, text, color)
    }

    private fun parseTags(raw: String): Map<String, String> {
        if (raw.isEmpty()) return emptyMap()
        return raw.split(';').associate { pair ->
            val eq = pair.indexOf('=')
            if (eq < 0) pair to "" else pair.substring(0, eq) to unescape(pair.substring(eq + 1))
        }
    }

    private fun unescape(value: String): String {
        val out = StringBuilder(value.length)
        var i = 0
        while (i < value.length) {
            val c = value[i]
            if (c == '\\' && i + 1 < value.length) {
                when (value[i + 1]) {
                    's' -> out.append(' ')
                    ':' -> out.append(';')
                    '\\' -> out.append('\\')
                    'r' -> out.append('\r')
                    'n' -> out.append('\n')
                    else -> out.append(value[i + 1])
                }
                i += 2
            } else {
                out.append(c)
                i++
            }
        }
        return out.toString()
    }
}
