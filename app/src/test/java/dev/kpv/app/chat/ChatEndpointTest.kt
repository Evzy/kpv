package dev.kpv.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ChatEndpointTest {

    @Test
    fun findsChatSocketInScript() {
        val js = "let r=new WebSocket(`wss://ws.example.st/chat?channel=\${e}\${t?`&reconnect=true`:``}`)"
        assertEquals("wss://ws.example.st/chat", ChatEndpoint.findInScript(js))
    }

    @Test
    fun noChatSocketInScript() {
        assertNull(ChatEndpoint.findInScript("const a = 'wss://other.example/live'"))
    }

    @Test
    fun collectsScriptUrlsFromPage() {
        val html = """
            <link rel="modulepreload" href="/_app-1/Abc.js">
            <script type="module" src="https://cdn.example.com/x/Def.js"></script>
            import("/_app-1/Abc.js")
            <img src="/poster.png">
        """.trimIndent()
        assertEquals(
            listOf("https://site.example/_app-1/Abc.js", "https://cdn.example.com/x/Def.js"),
            ChatEndpoint.scriptUrls(html, "https://site.example"),
        )
    }

    @Test
    fun buildsSocketUrl() {
        assertEquals(
            "wss://ws.example.st/chat?channel=3663",
            ChatEndpoint.socketUrl("wss://ws.example.st/chat", 3663, reconnect = false),
        )
        assertEquals(
            "wss://ws.example.st/chat?channel=3663&reconnect=true",
            ChatEndpoint.socketUrl("wss://ws.example.st/chat", 3663, reconnect = true),
        )
    }
}
