package com.ton.player.downloads

import kotlinx.coroutines.Job
import org.json.JSONObject
import java.io.File

internal const val LIBRARY_TRANSFER_EVENT = "libraryTransfer:event"
internal const val INVALID_LIBRARY_BUNDLE_ERROR = "Selected archive does not contain a TON export bundle"
internal const val INVALID_LIBRARY_MANIFEST_ERROR = "Selected archive does not contain a valid TON export manifest"
internal const val LIBRARY_TRANSFER_BUSY_ERROR = "Another library transfer is already running"
internal const val EXPORT_DESTINATION_PICKER_REQUEST_CODE = 42061

internal data class PreparedFileSpec(val filePath: String, val archivePath: String)
internal data class ExportJobSpec(
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
internal data class ImportJobSpec(
  val sourceUri: String,
  val sourceName: String,
  val existingHashes: Set<String>,
)
internal data class LoadedManifest(val rawJson: String, val json: JSONObject, val prefix: String)
internal data class ImportTrackTarget(
  val contentHashSha256: String?,
  val fileHash: String,
  val inLibrary: Boolean,
  val relativePath: String,
  val stageFile: File,
  val format: String?,
)
internal data class PlaylistCoverTarget(val relativePath: String, val stageFile: File)
internal data class ImportStage(
  val rootDir: File,
  val manifestFile: File,
  val resultFile: File,
  val tracksDir: File,
  val artworkDir: File,
)
internal sealed class TransferSpec {
  data class Export(val request: ExportJobSpec) : TransferSpec()
  data class Import(val request: ImportJobSpec) : TransferSpec()
}
internal data class TransferJobState(
  val id: String,
  val spec: TransferSpec,
  val cleanupPaths: MutableList<String> = mutableListOf(),
  var runningJob: Job? = null,
)
