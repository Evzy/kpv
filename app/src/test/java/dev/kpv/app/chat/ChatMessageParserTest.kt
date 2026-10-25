package dev.kpv.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatMessageParserTest {

    private fun line(user: String, text: String, uuid: String = "u-$user-$text", color: String = "ff5733") =
        """{"message":"$text","username":"$user","color":"$color","badges":[],"uuid":"$uuid"}"""

    @Test
    fun parsesLiveLine() {
        val messages = ChatMessageParser.parse(line("lagged_6", "hello there", uuid = "abc"))
        assertEquals(1, messages.size)
        val m = messages[0]
        assertEquals("abc", m.id)
        assertEquals("lagged_6", m.username)
        assertEquals("hello there", m.text)
        assertEquals(0xFFFF5733.toInt(), m.color)
    }

    @Test
    fun prefillKeepsOnlyLatestMessages() {
        val items = (1..8).joinToString(",") { line("u$it", "m$it") }
        val messages = ChatMessageParser.parse("""{"prefill":[$items]}""")
        assertEquals(ChatMessageParser.PREFILL_LIMIT, messages.size)
        assertEquals("m4", messages.first().text)
        assertEquals("m8", messages.last().text)
    }

    @Test
    fun ignoresViewerPings() {
        assertTrue(ChatMessageParser.parse("""{"viewers":4}""").isEmpty())
    }

    @Test
    fun ignoresPrivateSystemMessages() {
        val frame = """{"username":"SYSTEM","platform":"internal","message":"Welcome. Please <a href=\"/auth/login\">login</a>.","admin":1,"private":1}"""
        assertTrue(ChatMessageParser.parse(frame).isEmpty())
    }

    @Test
    fun ignoresBlankText() {
        assertTrue(ChatMessageParser.parse(line("x", "   ")).isEmpty())
    }

    @Test
    fun stripsHtmlAndDecodesEntities() {
        assertEquals(
            "go here & <now> \"ok\" it's é",
            ChatMessageParser.plainText("go <a href='/x'>here</a> &amp; &lt;now&gt; &quot;ok&quot; it&#39;s &#233;"),
        )
        assertEquals("a b", ChatMessageParser.plainText("a<br>\n  b"))
    }

    @Test
    fun invalidColourIsNull() {
        assertNull(ChatMessageParser.parse(line("x", "hi", color = "")).single().color)
        assertNull(ChatMessageParser.parse(line("x", "hi", color = "zzzzzz")).single().color)
    }

    @Test
    fun malformedJsonIsEmpty() {
        assertTrue(ChatMessageParser.parse("not json").isEmpty())
    }
}
