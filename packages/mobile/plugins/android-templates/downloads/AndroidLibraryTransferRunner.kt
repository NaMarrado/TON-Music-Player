package com.ton.player.downloads

import android.net.Uri
import com.facebook.react.bridge.ReactApplicationContext
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

internal class AndroidLibraryTransferRunner(
  context: ReactApplicationContext,
  private val emitProgress: (String, String, Int, Int) -> Unit,
) {
  private val files = AndroidLibraryTransferFiles(context)
  private val archive = AndroidLibraryTransferArchive(context, files)

  suspend fun run(job: TransferJobState): String = when (val spec = job.spec) {
    is TransferSpec.Export -> runExport(job, spec.request)
    is TransferSpec.Import -> runImport(job, spec.request)
  }

  fun cleanup(job: TransferJobState) = files.cleanupJobArtifacts(job)

  private suspend fun runExport(job: TransferJobState, request: ExportJobSpec): String {
    emitProgress(job.id, "preparing", 0, 1)
    job.cleanupPaths.add(request.outputUri)
    archive.writeZipArchive(
      request,
      { current, total -> emitProgress(job.id, "tracks", current, total) },
      { current, total -> emitProgress(job.id, "playlists", current, total) },
    )
    emitProgress(job.id, "done", 1, 1)
    job.cleanupPaths.clear()
    return JSONObject()
      .put("folderName", request.fileName)
      .put("bundleType", request.bundleType)
      .put("trackCount", request.trackCount)
      .put("playlistCount", request.playlistCount)
      .put("sizeBytes", request.sizeBytes)
      .put("resultFileUri", request.outputUri)
      .toString()
  }

  private suspend fun runImport(job: TransferJobState, request: ImportJobSpec): String {
    emitProgress(job.id, "preparing", 0, 1)
    val loadedManifest = archive.loadManifest(request.sourceUri)
    val bundleType = loadedManifest.json.optString("bundle_type").ifBlank { "library" }
    val tracks = loadedManifest.json.optJSONArray("tracks")
      ?: throw IllegalStateException(INVALID_LIBRARY_MANIFEST_ERROR)
    val playlists = loadedManifest.json.optJSONArray("playlists")
      ?: throw IllegalStateException(INVALID_LIBRARY_MANIFEST_ERROR)
    val stage = files.createImportStage(job.id)
    job.cleanupPaths.add(stage.rootDir.absolutePath)
    files.writeTextFile(stage.manifestFile, loadedManifest.rawJson)

    val trackTargets = linkedMapOf<String, ImportTrackTarget>()
    val trackHashesToMarkInLibrary = mutableSetOf<String>()
    val existingTrackAliases = JSONObject()
    var skippedTracks = 0
    for (index in 0 until tracks.length()) {
      val track = tracks.optJSONObject(index) ?: continue
      val fileHash = track.optString("file_hash")
      val contentHash = track.optString("content_hash_sha256").ifBlank { null }
      if (fileHash.isBlank()) {
        skippedTracks += 1
        continue
      }
      val existingIdentity = when {
        request.existingHashes.contains(fileHash) -> fileHash
        contentHash != null && request.existingHashes.contains(contentHash) -> contentHash
        else -> null
      }
      if (existingIdentity != null) {
        existingTrackAliases.put(fileHash, existingIdentity)
        trackHashesToMarkInLibrary.add(fileHash)
        skippedTracks += 1
        continue
      }
      if (trackTargets.values.any { it.fileHash == fileHash }) {
        skippedTracks += 1
        continue
      }
      val relativePath = track.optString("relative_path")
      if (relativePath.isBlank()) {
        skippedTracks += 1
        continue
      }
      val extension = files.getFileExtension(relativePath)
      val target = ImportTrackTarget(
        contentHashSha256 = contentHash,
        fileHash = fileHash,
        inLibrary = true,
        relativePath = relativePath,
        stageFile = File(stage.tracksDir, "$fileHash$extension"),
        format = extension.removePrefix(".").ifBlank { null }?.lowercase(),
      )
      trackTargets[files.resolveArchiveEntryName(loadedManifest.prefix, relativePath)] = target
    }

    val coverTargets = linkedMapOf<String, PlaylistCoverTarget>()
    for (index in 0 until playlists.length()) {
      val playlist = playlists.optJSONObject(index) ?: continue
      val relativePath = playlist.optString("cover_relative_path")
      if (relativePath.isBlank() || coverTargets.containsKey(relativePath)) continue
      val extension = files.getFileExtension(relativePath).ifBlank { ".jpg" }
      val target = PlaylistCoverTarget(
        relativePath,
        File(stage.artworkDir, "playlist-cover-${UUID.randomUUID()}$extension"),
      )
      coverTargets[files.resolveArchiveEntryName(loadedManifest.prefix, relativePath)] = target
    }

    val preparedTracks = JSONArray()
    val coverPathMap = JSONObject()
    val extractedTrackPaths = mutableSetOf<String>()
    archive.openZipInputStream(request.sourceUri).use { input ->
      var entry = input.nextEntry
      while (entry != null) {
        currentCoroutineContext().ensureActive()
        val name = files.normalizeArchivePath(entry.name)
        val trackTarget = trackTargets[name]
        if (!entry.isDirectory && trackTarget != null) {
          archive.copyEntry(input, trackTarget.stageFile)
          extractedTrackPaths.add(name)
          preparedTracks.put(JSONObject().apply {
            put("contentHashSha256", trackTarget.contentHashSha256)
            put("fileHash", trackTarget.fileHash)
            put("stagedFilePath", Uri.fromFile(trackTarget.stageFile).toString())
            put("fileSize", trackTarget.stageFile.length())
            put("format", trackTarget.format)
            put("inLibrary", trackTarget.inLibrary)
          })
          emitProgress(job.id, "tracks", preparedTracks.length(), trackTargets.size.coerceAtLeast(1))
        }
        val coverTarget = coverTargets[name]
        if (!entry.isDirectory && coverTarget != null) {
          archive.copyEntry(input, coverTarget.stageFile)
          coverPathMap.put(coverTarget.relativePath, Uri.fromFile(coverTarget.stageFile).toString())
          emitProgress(job.id, "playlists", coverPathMap.length(), coverTargets.size.coerceAtLeast(1))
        }
        input.closeEntry()
        entry = input.nextEntry
      }
    }

    skippedTracks += trackTargets.keys.count { !extractedTrackPaths.contains(it) }
    val resultJson = JSONObject()
      .put("bundleType", bundleType)
      .put("skippedTracks", skippedTracks)
      .put("manifestFilePath", Uri.fromFile(stage.manifestFile).toString())
      .put("preparedTracks", preparedTracks)
      .put("trackHashesToMarkInLibrary", JSONArray(trackHashesToMarkInLibrary.toList()))
      .put("existingTrackAliases", existingTrackAliases)
      .put("playlistCoverStagePaths", coverPathMap)
      .toString()
    files.writeTextFile(stage.resultFile, resultJson)
    emitProgress(job.id, "done", 1, 1)
    return JSONObject()
      .put("folderName", request.sourceName)
      .put("bundleType", bundleType)
      .put("resultFileUri", Uri.fromFile(stage.resultFile).toString())
      .put("skippedTracks", skippedTracks)
      .toString()
  }
}
