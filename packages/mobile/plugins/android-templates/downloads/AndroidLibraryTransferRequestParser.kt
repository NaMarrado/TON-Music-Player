package com.ton.player.downloads

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap

internal object AndroidLibraryTransferRequestParser {
  fun parseExport(request: ReadableMap) = ExportJobSpec(
    outputUri = request.getString("outputUri") ?: throw IllegalArgumentException("Missing outputUri"),
    fileName = request.getString("fileName") ?: "TON Export.zip",
    bundleType = request.getString("bundleType") ?: "library",
    manifestJson = request.getString("manifestJson")
      ?: throw IllegalArgumentException("Missing manifestJson"),
    trackFiles = parsePreparedFiles(request.getArray("trackFiles")),
    artworkFiles = parsePreparedFiles(request.getArray("artworkFiles")),
    trackCount = request.getInt("trackCount"),
    playlistCount = request.getInt("playlistCount"),
    sizeBytes = request.getDouble("sizeBytes").toLong(),
  )

  fun parseImport(request: ReadableMap) = ImportJobSpec(
    sourceUri = request.getString("sourceUri") ?: throw IllegalArgumentException("Missing sourceUri"),
    sourceName = request.getString("sourceName") ?: "TON Import.zip",
    existingHashes = buildSet {
      val values = request.getArray("existingHashes")
      if (values != null) {
        for (index in 0 until values.size()) {
          values.getString(index).takeIf { it.isNotBlank() }?.let(::add)
        }
      }
    },
  )

  private fun parsePreparedFiles(value: ReadableArray?): List<PreparedFileSpec> {
    if (value == null) return emptyList()
    return buildList {
      for (index in 0 until value.size()) {
        val entry = value.getMap(index)
        val filePath = entry.getString("filePath") ?: continue
        val archivePath = entry.getString("archivePath") ?: continue
        add(PreparedFileSpec(filePath, archivePath))
      }
    }
  }
}
