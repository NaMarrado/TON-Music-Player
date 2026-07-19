import Foundation
import React
import UIKit

@objc(IosBackgroundDownloads)
final class IosBackgroundDownloads: RCTEventEmitter, UIDocumentPickerDelegate {
  private var fileExportResolve: RCTPromiseResolveBlock?
  private var fileExportDirectory: URL?
  private let eventName = "iosBackgroundDownload"

  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    [eventName]
  }

  override func startObserving() {
    TONIosBackgroundDownloadsManager.sharedManager().setEventSink { [weak self] payload in
      self?.sendEvent(withName: self?.eventName ?? "iosBackgroundDownload", body: payload)
    }
  }

  override func stopObserving() {
    TONIosBackgroundDownloadsManager.sharedManager().setEventSink(nil)
  }

  @objc(shareFiles:resolver:rejecter:)
  func shareFiles(
    _ files: [[String: String]],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    DispatchQueue.main.async {
      guard self.fileExportResolve == nil else {
        reject("ios_library_export_busy", "Another file export is already open.", nil)
        return
      }
      guard let controller = self.topViewController() else {
        reject("ios_library_export_no_controller", "No active view controller is available.", nil)
        return
      }
      do {
        let urls = try self.stageFileExport(files)
        guard urls.allSatisfy({ FileManager.default.fileExists(atPath: $0.path) }) else {
          self.cleanupFileExportDirectory()
          reject("ios_library_export_missing_file", "One or more export files are missing.", nil)
          return
        }
        self.fileExportResolve = resolve
        let picker = UIDocumentPickerViewController(forExporting: urls, asCopy: true)
        picker.delegate = self
        controller.present(picker, animated: true)
      } catch {
        self.cleanupFileExportDirectory()
        reject("ios_library_export_staging_failed", error.localizedDescription, error)
      }
    }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finishFileExport(completed: false)
  }

  func documentPicker(
    _ controller: UIDocumentPickerViewController,
    didPickDocumentsAt urls: [URL]
  ) {
    finishFileExport(completed: true)
  }

  private func finishFileExport(completed: Bool) {
    let resolve = fileExportResolve
    fileExportResolve = nil
    cleanupFileExportDirectory()
    resolve?(completed)
  }

  private func stageFileExport(_ files: [[String: String]]) throws -> [URL] {
    guard !files.isEmpty else {
      throw NSError(
        domain: "TONLibraryExport",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "No export files were provided."]
      )
    }
    cleanupFileExportDirectory()
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("TON-File-Export-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    do {
      let urls = try files.enumerated().map { index, file in
        guard let sourceValue = file["sourceUri"] else {
          throw NSError(
            domain: "TONLibraryExport",
            code: 2,
            userInfo: [NSLocalizedDescriptionKey: "An export file is no longer available."]
          )
        }
        let source = localFileURL(from: sourceValue)
        guard FileManager.default.fileExists(atPath: source.path) else {
          throw NSError(
            domain: "TONLibraryExport",
            code: 2,
            userInfo: [NSLocalizedDescriptionKey: "An export file is no longer available."]
          )
        }
        let requestedName = file["fileName"]?.trimmingCharacters(in: .whitespacesAndNewlines)
        let fileName = requestedName?.isEmpty == false
          ? requestedName!
          : "Track \(index + 1).\(source.pathExtension)"
        let destination = directory.appendingPathComponent(fileName)
        try FileManager.default.copyItem(at: source, to: destination)
        return destination
      }
      fileExportDirectory = directory
      return urls
    } catch {
      try? FileManager.default.removeItem(at: directory)
      throw error
    }
  }

  private func localFileURL(from value: String) -> URL {
    guard value.hasPrefix("file://") else {
      return URL(fileURLWithPath: value)
    }
    let encodedPath = String(value.dropFirst("file://".count))
    let decodedPath = encodedPath.removingPercentEncoding ?? encodedPath
    if FileManager.default.fileExists(atPath: decodedPath) {
      return URL(fileURLWithPath: decodedPath)
    }
    return URL(fileURLWithPath: encodedPath)
  }

  private func cleanupFileExportDirectory() {
    guard let directory = fileExportDirectory else { return }
    fileExportDirectory = nil
    try? FileManager.default.removeItem(at: directory)
  }

  private func topViewController() -> UIViewController? {
    RCTPresentedViewController()
  }

  @objc(initialize:rejecter:)
  func initialize(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosBackgroundDownloadsManager.sharedManager().initialize {
      resolve(nil)
    }
  }

  @objc(startDownload:resolver:rejecter:)
  func startDownload(
    _ request: [String: Any],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    guard let parsedRequest = TONIosBackgroundDownloadRequest(dictionary: request) else {
      reject("ios_background_invalid_request", "Invalid iOS background download request.", nil)
      return
    }

    TONIosBackgroundDownloadsManager.sharedManager().startDownload(request: parsedRequest) { error in
      if let error {
        reject("ios_background_start_failed", error.localizedDescription, error)
        return
      }

      resolve(nil)
    }
  }

  @objc(beginDownloadActivity:resolver:rejecter:)
  func beginDownloadActivity(
    _ request: [String: Any],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    guard let parsedRequest = TONIosDownloadActivityRequest(dictionary: request) else {
      reject("ios_download_activity_invalid_request", "Invalid iOS download activity request.", nil)
      return
    }

    TONIosDownloadActivityManager.shared.begin(parsedRequest)
    resolve(nil)
  }

  @objc(endDownloadActivity:resolver:rejecter:)
  func endDownloadActivity(
    _ itemId: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosDownloadActivityManager.shared.end(itemId: itemId.intValue)
    resolve(nil)
  }

  @objc(recoverDownload:resolver:rejecter:)
  func recoverDownload(
    _ request: [String: Any],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    guard let parsedRequest = TONIosBackgroundDownloadRequest(dictionary: request) else {
      reject("ios_background_invalid_request", "Invalid iOS background download request.", nil)
      return
    }

    TONIosBackgroundDownloadsManager.sharedManager().recoverDownload(request: parsedRequest) { result in
      switch result {
      case .success(let record):
        resolve(record.asDictionary())
      case .failure(let error):
        reject("ios_background_recovery_failed", error.localizedDescription, error)
      }
    }
  }

  @objc(cancelDownload:resolver:rejecter:)
  func cancelDownload(
    _ itemId: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosBackgroundDownloadsManager.sharedManager().cancelDownload(itemId: itemId.intValue) {
      resolve(nil)
    }
  }

  @objc(getSnapshot:rejecter:)
  func getSnapshot(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosBackgroundDownloadsManager.sharedManager().getSnapshot { items in
      resolve(["items": items])
    }
  }

  @objc(acknowledgeSettled:resolver:rejecter:)
  func acknowledgeSettled(
    _ itemId: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
  ) {
    TONIosBackgroundDownloadsManager.sharedManager().acknowledgeSettled(itemId: itemId.intValue) {
      resolve(nil)
    }
  }
}
