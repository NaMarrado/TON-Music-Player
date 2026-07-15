package com.ton.player.downloads

import android.net.Uri
import com.facebook.react.bridge.ReactApplicationContext
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.nio.charset.StandardCharsets
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

internal class AndroidLibraryTransferArchive(
  private val context: ReactApplicationContext,
  private val files: AndroidLibraryTransferFiles,
) {
  suspend fun writeZipArchive(
    request: ExportJobSpec,
    onTrackProgress: (Int, Int) -> Unit,
    onArtworkProgress: (Int, Int) -> Unit,
  ) {
    openOutputStream(request.outputUri).use { outputStream ->
      ZipOutputStream(BufferedOutputStream(outputStream)).use { zipOutputStream ->
        writeZipEntry(zipOutputStream, "manifest.json", request.manifestJson.byteInputStream())
        request.trackFiles.forEachIndexed { index, fileSpec ->
          currentCoroutineContext().ensureActive()
          openInputStream(fileSpec.filePath).use { input ->
            writeZipEntry(zipOutputStream, fileSpec.archivePath, input)
          }
          onTrackProgress(index + 1, request.trackFiles.size.coerceAtLeast(1))
        }
        request.artworkFiles.forEachIndexed { index, fileSpec ->
          currentCoroutineContext().ensureActive()
          openInputStream(fileSpec.filePath).use { input ->
            writeZipEntry(zipOutputStream, fileSpec.archivePath, input)
          }
          onArtworkProgress(index + 1, request.artworkFiles.size.coerceAtLeast(1))
        }
      }
    }
  }

  fun loadManifest(sourceUri: String): LoadedManifest {
    val candidates = mutableListOf<Pair<String, String>>()
    openZipInputStream(sourceUri).use { input ->
      var entry = input.nextEntry
      while (entry != null) {
        if (!entry.isDirectory) {
          val name = files.normalizeArchivePath(entry.name)
          if (name == "manifest.json" || name.endsWith("/manifest.json")) {
            candidates.add(name to readZipEntryText(input))
          }
        }
        input.closeEntry()
        entry = input.nextEntry
      }
    }
    val selected = candidates.find { it.first == "manifest.json" }
      ?: if (candidates.size == 1) candidates[0] else null
      ?: throw IllegalStateException(INVALID_LIBRARY_BUNDLE_ERROR)
    val parsed = try {
      JSONObject(selected.second)
    } catch (_: Exception) {
      throw IllegalStateException(INVALID_LIBRARY_MANIFEST_ERROR)
    }
    if (!parsed.has("tracks") || !parsed.has("playlists")) {
      throw IllegalStateException(INVALID_LIBRARY_MANIFEST_ERROR)
    }
    val prefix = if (selected.first == "manifest.json") ""
      else selected.first.removeSuffix("manifest.json")
    return LoadedManifest(selected.second, parsed, prefix)
  }

  fun openZipInputStream(sourceUri: String) =
    ZipInputStream(BufferedInputStream(openInputStream(sourceUri)))

  suspend fun copyEntry(input: ZipInputStream, destination: File) {
    destination.parentFile?.mkdirs()
    BufferedOutputStream(FileOutputStream(destination)).use { output ->
      val buffer = ByteArray(32 * 1024)
      while (true) {
        currentCoroutineContext().ensureActive()
        val read = input.read(buffer)
        if (read <= 0) break
        output.write(buffer, 0, read)
      }
      output.flush()
    }
  }

  private fun readZipEntryText(input: ZipInputStream): String {
    val buffer = ByteArray(16 * 1024)
    val output = ByteArrayOutputStream()
    while (true) {
      val read = input.read(buffer)
      if (read <= 0) break
      output.write(buffer, 0, read)
    }
    return output.toString(StandardCharsets.UTF_8.name())
  }

  private fun writeZipEntry(output: ZipOutputStream, path: String, input: InputStream) {
    output.putNextEntry(ZipEntry(files.normalizeArchivePath(path)))
    input.copyTo(output, 32 * 1024)
    output.closeEntry()
  }

  private fun openInputStream(uriString: String): InputStream {
    val uri = Uri.parse(uriString)
    return when (uri.scheme) {
      null, "", "file" -> BufferedInputStream(FileInputStream(files.resolveFile(uriString)))
      else -> BufferedInputStream(
        context.contentResolver.openInputStream(uri)
          ?: throw IllegalStateException("Unable to open input stream for $uriString"),
      )
    }
  }

  private fun openOutputStream(uriString: String): OutputStream {
    val uri = Uri.parse(uriString)
    return when (uri.scheme) {
      null, "", "file" -> {
        val file = files.resolveFile(uriString)
        file.parentFile?.mkdirs()
        BufferedOutputStream(FileOutputStream(file))
      }
      else -> BufferedOutputStream(
        context.contentResolver.openOutputStream(uri, "w")
          ?: throw IllegalStateException("Unable to open output stream for $uriString"),
      )
    }
  }
}
