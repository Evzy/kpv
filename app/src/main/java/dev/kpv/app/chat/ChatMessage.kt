package dev.kpv.app.chat

data class ChatMessage(
    val id: String,
    val username: String,
    val text: String,
    /** Opaque ARGB username colour, or null to use the default. */
    val color: Int?,
)
