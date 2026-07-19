package com.ton.player.car

import android.net.Uri

object TonCarMediaIds {
    const val ROOT = "ton:root"
    const val LIBRARY = "ton:library"
    const val PLAYLISTS = "ton:playlists"

    fun libraryLetter(letter: String) = "ton:library:letter:${Uri.encode(letter)}"
    fun libraryPage(letter: String, offset: Int) =
        "ton:library:page:${Uri.encode(letter)}:$offset"
    fun playlistsPage(offset: Int) = "ton:playlists:page:$offset"
    fun playlist(playlistId: Long) = "ton:playlist:$playlistId"
    fun playlistPage(playlistId: Long, offset: Int) = "ton:playlist:$playlistId:page:$offset"
    fun libraryTrack(trackId: Long) = "ton:play:library:$trackId"
    fun playlistTrack(playlistId: Long, playlistTrackId: Long) =
        "ton:play:playlist:$playlistId:$playlistTrackId"
}
