package com.ton.player.downloads

import android.net.Uri
import com.facebook.react.bridge.ReactApplicationContext
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.nio.charset.StandardCharsets

internal class AndroidLibraryTransferFiles(
  private val context: ReactApplicationContext,
) {
  fun resolveFile(uriString: String): File {
    val uri = Uri.parse(uriString)
    val path = when {
      uri.scheme == "file" -> uri.path
      uri.scheme.isNullOrBlank() -> uriString.removePrefix("file://")
      else -> throw IllegalArgumentException("Unsupported file URI: $uriString")
    } ?: throw IllegalArgumentException("Missing file path for URI: $uriString")
    return File(path)
  }

  fun createImportStage(jobId: String): ImportStage {
    val rootParent = context.cacheDir ?: context.filesDir
      ?: throw IllegalStateException("No writable cache directory is available")
    val rootDir = File(rootParent, "library-transfer/$jobId")
    val tracksDir = File(rootDir, "tracks")
    val artworkDir = File(rootDir, "artwork")
    tracksDir.mkdirs()
    artworkDir.mkdirs()
    return ImportStage(
      rootDir = rootDir,
      manifestFile = File(rootDir, "manifest.json"),
      resultFile = File(rootDir, "result.json"),
      tracksDir = tracksDir,
      artworkDir = artworkDir,
    )
  }

  fun writeTextFile(targetFile: File, contents: String) {
    targetFile.parentFile?.mkdirs()
    BufferedOutputStream(FileOutputStream(targetFile)).use { output ->
      output.write(contents.toByteArray(StandardCharsets.UTF_8))
      output.flush()
    }
  }

  fun getFileExtension(path: String): String {
    val cleanPath = path.substringBefore('?')
    val dotIndex = cleanPath.lastIndexOf('.')
    return if (dotIndex < 0 || dotIndex < cleanPath.lastIndexOf('/')) ""
      else cleanPath.substring(dotIndex).lowercase()
  }

  fun normalizeArchivePath(value: String) = value.replace('\\', '/').trimStart('/')
  fun resolveArchiveEntryName(prefix: String, relativePath: String) =
    normalizeArchivePath("$prefix$relativePath")

  fun cleanupJobArtifacts(job: TransferJobState) {
    job.cleanupPaths.forEach { path ->
      try {
        val uri = Uri.parse(path)
        when (uri.scheme) {
          "content" -> context.contentResolver.delete(uri, null, null)
          "file", null, "" -> resolveFile(path).deleteRecursively()
          else -> Unit
        }
      } catch (_: Exception) {
        // Best-effort cleanup for cancelled/failed transfers.
      }
    }
    job.cleanupPaths.clear()
  }
}
