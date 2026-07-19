package com.ton.player.car

import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.os.Bundle
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.MediaMetadataCompat
import java.io.File
import java.util.Locale

class TonCarCatalogRepository(private val context: Context) {
    private data class TrackRow(
        val id: Long,
        val playlistTrackId: Long?,
        val title: String,
        val artist: String?,
        val album: String?,
        val durationMs: Long?,
        val filePath: String,
    )

    private data class PlaylistRow(val id: Long, val name: String)

    fun loadChildren(parentId: String): List<MediaBrowserCompat.MediaItem> = when {
        parentId == TonCarMediaIds.ROOT -> listOf(
            browsable(TonCarMediaIds.LIBRARY, "Library"),
            browsable(TonCarMediaIds.PLAYLISTS, "Playlists"),
        )
        parentId == TonCarMediaIds.LIBRARY -> libraryRoot()
        parentId.startsWith("ton:library:letter:") -> libraryLetter(parentId)
        parentId.startsWith("ton:library:page:") -> libraryPage(parentId)
        parentId == TonCarMediaIds.PLAYLISTS -> playlistsRoot()
        parentId.startsWith("ton:playlists:page:") -> playlistsPage(parentId)
        parentId.matches(Regex("^ton:playlist:\\d+$")) -> playlistRoot(parentId)
        parentId.matches(Regex("^ton:playlist:\\d+:page:\\d+$")) -> playlistPage(parentId)
        else -> emptyList()
    }

    private fun libraryRoot(): List<MediaBrowserCompat.MediaItem> {
        val tracks = queryLibraryTracks()
        if (tracks.size <= PAGE_SIZE) return tracks.map(::libraryTrack)
        return tracks.groupBy(::letterFor).map { (letter, rows) ->
            browsable(TonCarMediaIds.libraryLetter(letter), "$letter (${rows.size})")
        }
    }

    private fun libraryLetter(parentId: String): List<MediaBrowserCompat.MediaItem> {
        val letter = Uri.decode(parentId.removePrefix("ton:library:letter:"))
        val tracks = queryLibraryTracks().filter { letterFor(it) == letter }
        return pagedTracks(tracks, letter) { offset -> TonCarMediaIds.libraryPage(letter, offset) }
    }

    private fun libraryPage(parentId: String): List<MediaBrowserCompat.MediaItem> {
        val match = Regex("^ton:library:page:(.*):(\\d+)$").matchEntire(parentId) ?: return emptyList()
        val letter = Uri.decode(match.groupValues[1])
        val offset = match.groupValues[2].toIntOrNull() ?: return emptyList()
        return queryLibraryTracks()
            .filter { letterFor(it) == letter }
            .drop(offset)
            .take(PAGE_SIZE)
            .map(::libraryTrack)
    }

    private fun playlistsRoot(): List<MediaBrowserCompat.MediaItem> {
        val playlists = queryPlaylists()
        if (playlists.size <= PAGE_SIZE) return playlists.map(::playlistItem)
        return playlists.indices.step(PAGE_SIZE).map { offset ->
            browsable(
                TonCarMediaIds.playlistsPage(offset),
                rangeTitle(offset, minOf(offset + PAGE_SIZE, playlists.size)),
            )
        }
    }

    private fun playlistsPage(parentId: String): List<MediaBrowserCompat.MediaItem> {
        val offset = parentId.removePrefix("ton:playlists:page:").toIntOrNull() ?: return emptyList()
        return queryPlaylists().drop(offset).take(PAGE_SIZE).map(::playlistItem)
    }

    private fun playlistRoot(parentId: String): List<MediaBrowserCompat.MediaItem> {
        val playlistId = parentId.removePrefix("ton:playlist:").toLongOrNull() ?: return emptyList()
        val tracks = queryPlaylistTracks(playlistId)
        if (tracks.size <= PAGE_SIZE) return tracks.map { playlistTrack(playlistId, it) }
        return tracks.indices.step(PAGE_SIZE).map { offset ->
            browsable(
                TonCarMediaIds.playlistPage(playlistId, offset),
                rangeTitle(offset, minOf(offset + PAGE_SIZE, tracks.size)),
            )
        }
    }

    private fun playlistPage(parentId: String): List<MediaBrowserCompat.MediaItem> {
        val match = Regex("^ton:playlist:(\\d+):page:(\\d+)$").matchEntire(parentId)
            ?: return emptyList()
        val playlistId = match.groupValues[1].toLongOrNull() ?: return emptyList()
        val offset = match.groupValues[2].toIntOrNull() ?: return emptyList()
        return queryPlaylistTracks(playlistId)
            .drop(offset)
            .take(PAGE_SIZE)
            .map { playlistTrack(playlistId, it) }
    }

    private fun pagedTracks(
        tracks: List<TrackRow>,
        label: String,
        pageId: (Int) -> String,
    ): List<MediaBrowserCompat.MediaItem> {
        if (tracks.size <= PAGE_SIZE) return tracks.map(::libraryTrack)
        return tracks.indices.step(PAGE_SIZE).map { offset ->
            browsable(pageId(offset), "$label ${rangeTitle(offset, minOf(offset + PAGE_SIZE, tracks.size))}")
        }
    }

    private fun queryLibraryTracks(): List<TrackRow> = withDatabase { db ->
        db.rawQuery(
            """SELECT id, title, artist, album, duration_ms, file_path
               FROM tracks
               WHERE file_path IS NOT NULL AND TRIM(file_path) <> ''
               ORDER BY COALESCE(title, '') COLLATE NOCASE,
                        COALESCE(artist, '') COLLATE NOCASE,
                        id""",
            null,
        ).use { cursor -> cursor.mapRows { trackFromCursor(it, null) }.filter(::isReadable) }
    } ?: emptyList()

    private fun queryPlaylists(): List<PlaylistRow> = withDatabase { db ->
        db.rawQuery(
            "SELECT id, name FROM playlists ORDER BY sort_order ASC, created_at DESC, id ASC",
            null,
        ).use { cursor ->
            cursor.mapRows { PlaylistRow(it.getLong(0), it.getString(1) ?: "Playlist") }
        }
    } ?: emptyList()

    private fun queryPlaylistTracks(playlistId: Long): List<TrackRow> = withDatabase { db ->
        db.rawQuery(
            """SELECT t.id, pt.id, t.title, t.artist, t.album, t.duration_ms, t.file_path
               FROM playlist_tracks pt
               JOIN tracks t ON t.id = pt.track_id
               WHERE pt.playlist_id = ?
                 AND t.file_path IS NOT NULL AND TRIM(t.file_path) <> ''
               ORDER BY pt.position ASC, pt.id ASC""",
            arrayOf(playlistId.toString()),
        ).use { cursor ->
            cursor.mapRows {
                TrackRow(
                    id = it.getLong(0),
                    playlistTrackId = it.getLong(1),
                    title = it.getString(2) ?: "Unknown track",
                    artist = it.getString(3),
                    album = it.getString(4),
                    durationMs = if (it.isNull(5)) null else it.getLong(5),
                    filePath = it.getString(6),
                )
            }.filter(::isReadable)
        }
    } ?: emptyList()

    private fun trackFromCursor(cursor: Cursor, playlistTrackId: Long?) = TrackRow(
        id = cursor.getLong(0),
        playlistTrackId = playlistTrackId,
        title = cursor.getString(1) ?: "Unknown track",
        artist = cursor.getString(2),
        album = cursor.getString(3),
        durationMs = if (cursor.isNull(4)) null else cursor.getLong(4),
        filePath = cursor.getString(5),
    )

    private fun isReadable(track: TrackRow): Boolean = try {
        val uri = Uri.parse(track.filePath)
        when (uri.scheme?.lowercase(Locale.ROOT)) {
            "content" -> context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { true } ?: false
            "file" -> uri.path?.let { File(it).isFile } == true
            null, "" -> File(track.filePath).isFile
            else -> false
        }
    } catch (_: Exception) {
        false
    }

    private fun libraryTrack(track: TrackRow) = playable(
        TonCarMediaIds.libraryTrack(track.id),
        track,
    )

    private fun playlistTrack(playlistId: Long, track: TrackRow): MediaBrowserCompat.MediaItem {
        val playlistTrackId = track.playlistTrackId ?: return libraryTrack(track)
        return playable(TonCarMediaIds.playlistTrack(playlistId, playlistTrackId), track)
    }

    private fun playlistItem(playlist: PlaylistRow) =
        browsable(TonCarMediaIds.playlist(playlist.id), playlist.name)

    private fun playable(mediaId: String, track: TrackRow): MediaBrowserCompat.MediaItem {
        val extras = Bundle().apply {
            track.durationMs?.let { putLong(MediaMetadataCompat.METADATA_KEY_DURATION, it) }
        }
        val description = MediaDescriptionCompat.Builder()
            .setMediaId(mediaId)
            .setTitle(track.title)
            .setSubtitle(track.artist)
            .setDescription(track.album)
            .setExtras(extras)
            .build()
        return MediaBrowserCompat.MediaItem(description, MediaBrowserCompat.MediaItem.FLAG_PLAYABLE)
    }

    private fun browsable(mediaId: String, title: String): MediaBrowserCompat.MediaItem {
        val description = MediaDescriptionCompat.Builder().setMediaId(mediaId).setTitle(title).build()
        return MediaBrowserCompat.MediaItem(description, MediaBrowserCompat.MediaItem.FLAG_BROWSABLE)
    }

    private fun letterFor(track: TrackRow): String {
        val first = track.title.trim().firstOrNull()?.uppercaseChar() ?: return "#"
        return if (first in 'A'..'Z') first.toString() else "#"
    }

    private fun rangeTitle(offset: Int, endExclusive: Int) = "${offset + 1}-$endExclusive"

    private fun <T> withDatabase(block: (SQLiteDatabase) -> T): T? {
        val databaseFile = databaseCandidates().firstOrNull(File::isFile)
            ?: return null
        return SQLiteDatabase.openDatabase(databaseFile.path, null, SQLiteDatabase.OPEN_READONLY).use(block)
    }

    private fun databaseCandidates() = listOf(
        File(context.filesDir, "SQLite/ton.db"),
        context.getDatabasePath("ton.db"),
    )

    private fun <T> Cursor.mapRows(mapper: (Cursor) -> T): List<T> = buildList {
        while (moveToNext()) add(mapper(this@mapRows))
    }

    companion object {
        private const val PAGE_SIZE = 100
        private fun IntRange.step(size: Int): List<Int> =
            if (isEmpty()) emptyList() else (first..last step size).toList()
    }
}
