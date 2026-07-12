package com.ton.player.downloads

// Template source for the Android config plugin. Expo prebuild writes this into the generated Android project.
import android.app.Activity
import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import org.json.JSONArray
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
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

private const val LIBRARY_TRANSFER_EVENT = "libraryTransfer:event"
private const val INVALID_LIBRARY_BUNDLE_ERROR = "Selected archive does not contain a TON export bundle"
private const val INVALID_LIBRARY_MANIFEST_ERROR = "Selected archive does not contain a valid TON export manifest"
private const val LIBRARY_TRANSFER_BUSY_ERROR = "Another library transfer is already running"
private const val EXPORT_DESTINATION_PICKER_REQUEST_CODE = 42061

private data class PreparedFileSpec(
  val filePath: String,
  val archivePath: String,
)

private data class ExportJobSpec(
  val outputUri: String,
  val fileName: String,
  val bundleType: String,
  val manifestJson: String,
  val trackFiles: List<PreparedFileSpec>,
  val artworkFiles: List<PreparedFileSpec>,
  val trackCount: Int,
  val playlistCount: Int,
  val sizeBytes: Long,
)

private data class ImportJobSpec(
  val sourceUri: String,
  val sourceName: String,
  val existingHashes: Set<String>,
)

private data class LoadedManifest(
  val rawJson: String,
  val json: JSONObject,
  val prefix: String,
)

private data class ImportTrackTarget(
  val fileHash: String,
  val inLibrary: Boolean,
  val relativePath: String,
  val stageFile: File,
  val format: String?,
)

private data class PlaylistCoverTarget(
  val relativePath: String,
  val stageFile: File,
)

private data class ImportStage(
  val rootDir: File,
  val manifestFile: File,
  val resultFile: File,
  val tracksDir: File,
  val artworkDir: File,
)

private sealed class TransferSpec {
  data class Export(val request: ExportJobSpec) : TransferSpec()
  data class Import(val request: ImportJobSpec) : TransferSpec()
}

private data class TransferJobState(
  val id: String,
  val spec: TransferSpec,
  val cleanupPaths: MutableList<String> = mutableListOf(),
  var runningJob: Job? = null,
)

class AndroidLibraryTransferModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val queueLock = Any()
  private var activeJob: TransferJobState? = null
  private var pendingExportDestinationPromise: Promise? = null
  private val activityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != EXPORT_DESTINATION_PICKER_REQUEST_CODE) {
        return
      }

      val promise = pendingExportDestinationPromise
      pendingExportDestinationPromise = null
      if (promise == null) {
        return
      }

      if (resultCode != Activity.RESULT_OK) {
        promise.resolve(null)
        return
      }

      promise.resolve(data?.data?.toString())
    }
  }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = "AndroidLibraryTransfer"

  @Suppress("UNUSED_PARAMETER")
  @ReactMethod
  fun addListener(eventName: String?) {
    // Required by NativeEventEmitter in RN bridgeless mode.
  }

  @Suppress("UNUSED_PARAMETER")
  @ReactMethod
  fun removeListeners(count: Int) {
    // Required by NativeEventEmitter in RN bridgeless mode.
  }

  @ReactMethod
  fun startExport(request: ReadableMap, promise: Promise) {
    try {
      val jobId = request.getString("jobId") ?: UUID.randomUUID().toString()
      startJob(jobId, TransferSpec.Export(parseExportRequest(request)), promise)
    } catch (error: Exception) {
      promise.reject("android_library_transfer_export_request_failed", error)
    }
  }

  @ReactMethod
  fun pickExportDestination(fileName: String, promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject("android_library_transfer_no_activity", "No active Android activity")
      return
    }

    synchronized(queueLock) {
      if (pendingExportDestinationPromise != null) {
        promise.reject(
          "android_library_transfer_export_destination_pending",
          "Export destination picker is already open",
        )
        return
      }

      pendingExportDestinationPromise = promise
    }

    activity.runOnUiThread {
      try {
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "application/zip"
          putExtra(Intent.EXTRA_TITLE, fileName)
        }
        activity.startActivityForResult(intent, EXPORT_DESTINATION_PICKER_REQUEST_CODE)
      } catch (error: Exception) {
        synchronized(queueLock) {
          pendingExportDestinationPromise = null
        }
        promise.reject("android_library_transfer_pick_export_destination_failed", error)
      }
    }
  }

  @ReactMethod
  fun startImport(request: ReadableMap, promise: Promise) {
    try {
      val jobId = request.getString("jobId") ?: UUID.randomUUID().toString()
      startJob(jobId, TransferSpec.Import(parseImportRequest(request)), promise)
    } catch (error: Exception) {
      promise.reject("android_library_transfer_import_request_failed", error)
    }
  }

  @ReactMethod
  fun cancel(jobId: String, promise: Promise) {
    synchronized(queueLock) {
      if (activeJob?.id == jobId) {
        activeJob?.runningJob?.cancel(CancellationException("cancelled"))
      }
    }

    promise.resolve(null)
  }

  override fun invalidate() {
    scope.cancel("module-invalidated")
    synchronized(queueLock) {
      activeJob?.let { cleanupJobArtifacts(it) }
      activeJob = null
      pendingExportDestinationPromise?.resolve(null)
      pendingExportDestinationPromise = null
    }
    super.invalidate()
  }

  private fun startJob(jobId: String, spec: TransferSpec, promise: Promise) {
    val job = TransferJobState(jobId, spec)

    synchronized(queueLock) {
      if (activeJob != null) {
        promise.reject("android_library_transfer_busy", LIBRARY_TRANSFER_BUSY_ERROR)
        return
      }

      activeJob = job
    }

    job.runningJob = scope.launch {
      try {
        val resultJson = when (val activeSpec = job.spec) {
          is TransferSpec.Export -> runExportJob(job, activeSpec.request)
          is TransferSpec.Import -> runImportJob(job, activeSpec.request)
        }
        emitCompleted(job.id, resultJson)
      } catch (_: CancellationException) {
        cleanupJobArtifacts(job)
        emitCancelled(job.id)
      } catch (error: Exception) {
        cleanupJobArtifacts(job)
        emitFailed(job.id, error.message ?: "Library transfer failed")
      } finally {
        synchronized(queueLock) {
          if (activeJob?.id == job.id) {
            activeJob = null
          }
        }
      }
    }

    promise.resolve(job.id)
  }

  private suspend fun runExportJob(job: TransferJobState, request: ExportJobSpec): String {
    emitProgress(job.id, "preparing", 0, 1)
    job.cleanupPaths.add(request.outputUri)

    writeZipArchive(
      outputUri = request.outputUri,
      manifestJson = request.manifestJson,
      trackFiles = request.trackFiles,
      artworkFiles = request.artworkFiles,
      onTrackProgress = { current, total -> emitProgress(job.id, "tracks", current, total) },
      onArtworkProgress = { current, total -> emitProgress(job.id, "playlists", current, total) },
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

  private suspend fun runImportJob(job: TransferJobState, request: ImportJobSpec): String {
    emitProgress(job.id, "preparing", 0, 1)

    val loadedManifest = loadManifestFromArchive(request.sourceUri)
    val bundleType = loadedManifest.json.optString("bundle_type").ifBlank { "library" }
    val tracks = loadedManifest.json.optJSONArray("tracks")
      ?: throw IllegalStateException(INVALID_LIBRARY_MANIFEST_ERROR)
    val playlists = loadedManifest.json.optJSONArray("playlists")
      ?: throw IllegalStateException(INVALID_LIBRARY_MANIFEST_ERROR)

    val stage = createImportStage(job.id)
    job.cleanupPaths.add(stage.rootDir.absolutePath)
    writeTextFile(stage.manifestFile, loadedManifest.rawJson)

    val libraryTrackHashes = resolveLibraryTrackHashes(loadedManifest.json)
    val trackTargets = linkedMapOf<String, ImportTrackTarget>()
    val trackHashesToMarkInLibrary = mutableSetOf<String>()
    var skippedTracks = 0

    for (index in 0 until tracks.length()) {
      val track = tracks.optJSONObject(index) ?: continue
      val fileHash = track.optString("file_hash")
      if (fileHash.isBlank()) {
        skippedTracks += 1
        continue
      }

      if (request.existingHashes.contains(fileHash)) {
        if (libraryTrackHashes.contains(fileHash)) {
          trackHashesToMarkInLibrary.add(fileHash)
        }
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

      val ext = getFileExtension(relativePath)
      val stageFile = File(stage.tracksDir, "${fileHash}${ext.ifBlank { "" }}")
      val target = ImportTrackTarget(
        fileHash = fileHash,
        inLibrary = libraryTrackHashes.contains(fileHash),
        relativePath = relativePath,
        stageFile = stageFile,
        format = ext.removePrefix(".").ifBlank { null }?.lowercase(),
      )
      trackTargets[resolveArchiveEntryName(loadedManifest.prefix, relativePath)] = target
    }

    val coverTargets = linkedMapOf<String, PlaylistCoverTarget>()
    for (index in 0 until playlists.length()) {
      val playlist = playlists.optJSONObject(index) ?: continue
      val relativePath = playlist.optString("cover_relative_path")
      if (relativePath.isBlank() || coverTargets.containsKey(relativePath)) {
        continue
      }

      val ext = getFileExtension(relativePath).ifBlank { ".jpg" }
      val stageFile = File(stage.artworkDir, "playlist-cover-${UUID.randomUUID()}$ext")
      coverTargets[resolveArchiveEntryName(loadedManifest.prefix, relativePath)] = PlaylistCoverTarget(
        relativePath = relativePath,
        stageFile = stageFile,
      )
    }

    val preparedTracks = JSONArray()
    val coverPathMap = JSONObject()
    val extractedTrackPaths = mutableSetOf<String>()

    openZipInputStream(request.sourceUri).use { zipInputStream ->
      var entry = zipInputStream.nextEntry
      while (entry != null) {
        currentCoroutineContext().ensureActive()
        val normalizedName = normalizeArchivePath(entry.name)

        val trackTarget = trackTargets[normalizedName]
        if (!entry.isDirectory && trackTarget != null) {
          copyZipEntryToFile(zipInputStream, trackTarget.stageFile)
          extractedTrackPaths.add(normalizedName)
          preparedTracks.put(JSONObject().apply {
            put("fileHash", trackTarget.fileHash)
            put("stagedFilePath", Uri.fromFile(trackTarget.stageFile).toString())
            put("fileSize", trackTarget.stageFile.length())
            put("format", trackTarget.format)
            put("inLibrary", trackTarget.inLibrary)
          })
          emitProgress(job.id, "tracks", preparedTracks.length(), trackTargets.size.coerceAtLeast(1))
        }

        val coverTarget = coverTargets[normalizedName]
        if (!entry.isDirectory && coverTarget != null) {
          copyZipEntryToFile(zipInputStream, coverTarget.stageFile)
          coverPathMap.put(
            coverTarget.relativePath,
            Uri.fromFile(coverTarget.stageFile).toString(),
          )
          emitProgress(job.id, "playlists", coverPathMap.length(), coverTargets.size.coerceAtLeast(1))
        }

        zipInputStream.closeEntry()
        entry = zipInputStream.nextEntry
      }
    }

    val missingTracks = trackTargets.keys.count { !extractedTrackPaths.contains(it) }
    skippedTracks += missingTracks

    val resultJson = JSONObject()
      .put("bundleType", bundleType)
      .put("skippedTracks", skippedTracks)
      .put("manifestFilePath", Uri.fromFile(stage.manifestFile).toString())
      .put("preparedTracks", preparedTracks)
      .put("trackHashesToMarkInLibrary", JSONArray(trackHashesToMarkInLibrary.toList()))
      .put("playlistCoverStagePaths", coverPathMap)
      .toString()
    writeTextFile(stage.resultFile, resultJson)

    emitProgress(job.id, "done", 1, 1)

    return JSONObject()
      .put("folderName", request.sourceName)
      .put("bundleType", bundleType)
      .put("resultFileUri", Uri.fromFile(stage.resultFile).toString())
      .put("skippedTracks", skippedTracks)
      .toString()
  }

  private suspend fun writeZipArchive(
    outputUri: String,
    manifestJson: String,
    trackFiles: List<PreparedFileSpec>,
    artworkFiles: List<PreparedFileSpec>,
    onTrackProgress: (current: Int, total: Int) -> Unit,
    onArtworkProgress: (current: Int, total: Int) -> Unit,
  ) {
    openOutputStream(outputUri).use { outputStream ->
      ZipOutputStream(BufferedOutputStream(outputStream)).use { zipOutputStream ->
        writeZipEntry(zipOutputStream, "manifest.json", manifestJson.byteInputStream())

        trackFiles.forEachIndexed { index, fileSpec ->
          currentCoroutineContext().ensureActive()
          openInputStream(fileSpec.filePath).use { inputStream ->
            writeZipEntry(zipOutputStream, fileSpec.archivePath, inputStream)
          }
          onTrackProgress(index + 1, trackFiles.size.coerceAtLeast(1))
        }

        artworkFiles.forEachIndexed { index, fileSpec ->
          currentCoroutineContext().ensureActive()
          openInputStream(fileSpec.filePath).use { inputStream ->
            writeZipEntry(zipOutputStream, fileSpec.archivePath, inputStream)
          }
          onArtworkProgress(index + 1, artworkFiles.size.coerceAtLeast(1))
        }
      }
    }
  }

  private fun parseExportRequest(request: ReadableMap): ExportJobSpec {
    return ExportJobSpec(
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
  }

  private fun parseImportRequest(request: ReadableMap): ImportJobSpec {
    return ImportJobSpec(
      sourceUri = request.getString("sourceUri") ?: throw IllegalArgumentException("Missing sourceUri"),
      sourceName = request.getString("sourceName") ?: "TON Import.zip",
      existingHashes = buildSet {
        val values = request.getArray("existingHashes")
        if (values != null) {
          for (index in 0 until values.size()) {
            val value = values.getString(index)
            if (!value.isNullOrBlank()) {
              add(value)
            }
          }
        }
      },
    )
  }

  private fun parsePreparedFiles(value: ReadableArray?): List<PreparedFileSpec> {
    if (value == null) {
      return emptyList()
    }

    val files = mutableListOf<PreparedFileSpec>()
    for (index in 0 until value.size()) {
      val entry = value.getMap(index)
      val filePath = entry.getString("filePath") ?: continue
      val archivePath = entry.getString("archivePath") ?: continue
      files.add(PreparedFileSpec(filePath, archivePath))
    }
    return files
  }

  private fun loadManifestFromArchive(sourceUri: String): LoadedManifest {
    val manifestCandidates = mutableListOf<Pair<String, String>>()

    openZipInputStream(sourceUri).use { zipInputStream ->
      var entry = zipInputStream.nextEntry
      while (entry != null) {
        if (!entry.isDirectory) {
          val normalizedName = normalizeArchivePath(entry.name)
          if (normalizedName == "manifest.json" || normalizedName.endsWith("/manifest.json")) {
            manifestCandidates.add(normalizedName to readZipEntryText(zipInputStream))
          }
        }

        zipInputStream.closeEntry()
        entry = zipInputStream.nextEntry
      }
    }

    val selectedCandidate = manifestCandidates.find { it.first == "manifest.json" }
      ?: if (manifestCandidates.size == 1) manifestCandidates[0] else null
      ?: throw IllegalStateException(INVALID_LIBRARY_BUNDLE_ERROR)

    val prefix = if (selectedCandidate.first == "manifest.json") {
      ""
    } else {
      selectedCandidate.first.removeSuffix("manifest.json")
    }

    val parsed = try {
      JSONObject(selectedCandidate.second)
    } catch (_: Exception) {
      throw IllegalStateException(INVALID_LIBRARY_MANIFEST_ERROR)
    }

    if (!parsed.has("tracks") || !parsed.has("playlists")) {
      throw IllegalStateException(INVALID_LIBRARY_MANIFEST_ERROR)
    }

    return LoadedManifest(
      rawJson = selectedCandidate.second,
      json = parsed,
      prefix = prefix,
    )
  }

  private fun resolveLibraryTrackHashes(manifest: JSONObject): Set<String> {
    val bundleType = manifest.optString("bundle_type").ifBlank { "library" }
    val explicitHashes = manifest.optJSONArray("library_track_hashes")

    if (bundleType == "playlist") {
      return jsonArrayStrings(explicitHashes)
    }

    val explicit = jsonArrayStrings(explicitHashes)
    if (explicit.isNotEmpty()) {
      return explicit
    }

    val tracks = manifest.optJSONArray("tracks") ?: return emptySet()
    return buildSet {
      for (index in 0 until tracks.length()) {
        val track = tracks.optJSONObject(index) ?: continue
        val fileHash = track.optString("file_hash")
        if (fileHash.isNotBlank()) {
          add(fileHash)
        }
      }
    }
  }

  private fun jsonArrayStrings(value: JSONArray?): Set<String> {
    if (value == null) {
      return emptySet()
    }

    return buildSet {
      for (index in 0 until value.length()) {
        val entry = value.optString(index)
        if (entry.isNotBlank()) {
          add(entry)
        }
      }
    }
  }

  private fun readZipEntryText(zipInputStream: ZipInputStream): String {
    val buffer = ByteArray(16 * 1024)
    val output = ByteArrayOutputStream()
    while (true) {
      val read = zipInputStream.read(buffer)
      if (read <= 0) {
        break
      }
      output.write(buffer, 0, read)
    }
    return output.toString(StandardCharsets.UTF_8.name())
  }

  private suspend fun copyZipEntryToFile(zipInputStream: ZipInputStream, destinationFile: File) {
    destinationFile.parentFile?.mkdirs()
    BufferedOutputStream(FileOutputStream(destinationFile)).use { output ->
      val buffer = ByteArray(32 * 1024)
      while (true) {
        currentCoroutineContext().ensureActive()
        val read = zipInputStream.read(buffer)
        if (read <= 0) {
          break
        }
        output.write(buffer, 0, read)
      }
      output.flush()
    }
  }

  private fun writeZipEntry(
    zipOutputStream: ZipOutputStream,
    archivePath: String,
    inputStream: InputStream,
  ) {
    val normalizedPath = normalizeArchivePath(archivePath)
    zipOutputStream.putNextEntry(ZipEntry(normalizedPath))
    inputStream.copyTo(zipOutputStream, 32 * 1024)
    zipOutputStream.closeEntry()
  }

  private fun openZipInputStream(sourceUri: String): ZipInputStream {
    return ZipInputStream(BufferedInputStream(openInputStream(sourceUri)))
  }

  private fun openInputStream(uriString: String): InputStream {
    val uri = Uri.parse(uriString)
    return when (uri.scheme) {
      null, "", "file" -> BufferedInputStream(FileInputStream(resolveFile(uriString)))
      else -> BufferedInputStream(
        reactApplicationContext.contentResolver.openInputStream(uri)
          ?: throw IllegalStateException("Unable to open input stream for $uriString"),
      )
    }
  }

  private fun openOutputStream(uriString: String): OutputStream {
    val uri = Uri.parse(uriString)
    return when (uri.scheme) {
      null, "", "file" -> {
        val file = resolveFile(uriString)
        file.parentFile?.mkdirs()
        BufferedOutputStream(FileOutputStream(file))
      }
      else -> BufferedOutputStream(
        reactApplicationContext.contentResolver.openOutputStream(uri, "w")
          ?: throw IllegalStateException("Unable to open output stream for $uriString"),
      )
    }
  }

  private fun resolveFile(uriString: String): File {
    val uri = Uri.parse(uriString)
    val path = when {
      uri.scheme == "file" -> uri.path
      uri.scheme.isNullOrBlank() -> uriString.removePrefix("file://")
      else -> throw IllegalArgumentException("Unsupported file URI: $uriString")
    } ?: throw IllegalArgumentException("Missing file path for URI: $uriString")
    return File(path)
  }

  private fun createImportStage(jobId: String): ImportStage {
    val rootParent = reactApplicationContext.cacheDir ?: reactApplicationContext.filesDir
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

  private fun writeTextFile(targetFile: File, contents: String) {
    targetFile.parentFile?.mkdirs()
    BufferedOutputStream(FileOutputStream(targetFile)).use { output ->
      output.write(contents.toByteArray(StandardCharsets.UTF_8))
      output.flush()
    }
  }

  private fun getFileExtension(path: String): String {
    val cleanPath = path.substringBefore('?')
    val dotIndex = cleanPath.lastIndexOf('.')
    val slashIndex = cleanPath.lastIndexOf('/')
    if (dotIndex < 0 || dotIndex < slashIndex) {
      return ""
    }
    return cleanPath.substring(dotIndex).lowercase()
  }

  private fun resolveArchiveEntryName(prefix: String, relativePath: String): String {
    return normalizeArchivePath("$prefix$relativePath")
  }

  private fun normalizeArchivePath(value: String): String {
    return value.replace('\\', '/').trimStart('/')
  }

  private fun cleanupJobArtifacts(job: TransferJobState) {
    job.cleanupPaths.forEach { path ->
      try {
        val uri = Uri.parse(path)
        when (uri.scheme) {
          "content" -> reactApplicationContext.contentResolver.delete(uri, null, null)
          "file", null, "" -> resolveFile(path).deleteRecursively()
          else -> Unit
        }
      } catch (_: Exception) {
        // Best-effort cleanup for cancelled/failed transfers.
      }
    }
    job.cleanupPaths.clear()
  }

  private fun emitProgress(jobId: String, phase: String, current: Int, total: Int) {
    emitEvent(Arguments.createMap().apply {
      putString("jobId", jobId)
      putString("state", "progress")
      putString("phase", phase)
      putInt("current", current)
      putInt("total", total)
    })
  }

  private fun emitCompleted(jobId: String, resultJson: String) {
    emitEvent(Arguments.createMap().apply {
      putString("jobId", jobId)
      putString("state", "completed")
      putString("resultJson", resultJson)
    })
  }

  private fun emitFailed(jobId: String, errorMessage: String) {
    emitEvent(Arguments.createMap().apply {
      putString("jobId", jobId)
      putString("state", "failed")
      putString("error", errorMessage)
    })
  }

  private fun emitCancelled(jobId: String) {
    emitEvent(Arguments.createMap().apply {
      putString("jobId", jobId)
      putString("state", "cancelled")
    })
  }

  private fun emitEvent(payload: WritableMap) {
    if (!reactApplicationContext.hasActiveReactInstance()) {
      return
    }

    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(LIBRARY_TRANSFER_EVENT, payload)
  }
}
