package dev.kpv.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TwitchIrcTest {

    @Test
    fun parsesTaggedPrivmsg() {
        val line = "@badge-info=;color=#1E90FF;display-name=Hoops_Fan;id=abc-123;mod=0 " +
            ":hoops_fan!hoops_fan@hoops_fan.tmi.twitch.tv PRIVMSG #somechannel :let's go thunder"
        val message = TwitchIrc.parseLine(line)!!
        assertEquals("abc-123", message.id)
        assertEquals("Hoops_Fan", message.username)
        assertEquals("let's go thunder", message.text)
        assertEquals(0xFF1E90FF.toInt(), message.color)
    }

    @Test
    fun fallsBackToLoginWithoutTags() {
        val message = TwitchIrc.parseLine(":viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #c :hi there")!!
        assertEquals("viewer", message.username)
        assertEquals("hi there", message.text)
        assertNull(message.color)
    }

    @Test
    fun unescapesDisplayNameAndStripsActionMarkers() {
        val line = "@color=;display-name=A\\sB;id=1 :a!a@a.tmi.twitch.tv PRIVMSG #c :\u0001ACTION waves\u0001"
        val message = TwitchIrc.parseLine(line)!!
        assertEquals("A B", message.username)
        assertEquals("waves", message.text)
        assertNull(message.color)
    }

    @Test
    fun ignoresNonChatLines() {
        assertNull(TwitchIrc.parseLine("PING :tmi.twitch.tv"))
        assertNull(TwitchIrc.parseLine(":tmi.twitch.tv 001 justinfan123 :Welcome, GLHF!"))
        assertNull(TwitchIrc.parseLine("@emote-only=0 :tmi.twitch.tv ROOMSTATE #c"))
    }

    @Test
    fun findsChannelInEmbedMarkup() {
        val html = """<iframe src="https://www.twitch.tv/embed/Some_Channel42/chat?parent=example.com"></iframe>"""
        assertEquals("some_channel42", TwitchIrc.findChannel(html))
        assertNull(TwitchIrc.findChannel("<iframe src=\"/player\"></iframe>"))
    }
}
