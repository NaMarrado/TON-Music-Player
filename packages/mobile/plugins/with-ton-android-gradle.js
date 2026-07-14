const {
  getFfmpegKitAndroidBootstrapSource,
} = require('./with-ton-android-build-sources');

const HERMES_FLAGS_LINE =
  '    hermesFlags = ["-O", "-output-source-map", "-include-globals=${projectRoot}/hermes/globals.js"]\n';
const COROUTINES_DEPENDENCY_LINE =
  '    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")\n';
const FFMPEG_KIT_PACKAGE_LINE =
  "        ffmpegKitPackage = findProperty('ffmpegKitPackage') ?: 'audio'\n";
const FFMPEG_KIT_LOCAL_REPO_LINE =
  "        maven { url(new File(rootDir, '.gradle/ffmpeg-kit-repo')) }\n";

function insertAfter(contents, anchor, addition, label) {
  if (contents.includes(addition.trim())) return contents;
  const index = contents.indexOf(anchor);
  if (index === -1) {
    throw new Error(`Unable to find ${label} anchor in generated Gradle file.`);
  }
  return contents.slice(0, index + anchor.length) + addition + contents.slice(index + anchor.length);
}

function upsertHermesFlags(contents) {
  const marker = '    hermesFlags = [';
  const markerIndex = contents.indexOf(marker);
  if (markerIndex !== -1) {
    const markerEnd = contents.indexOf('\n', markerIndex);
    if (markerEnd === -1) {
      throw new Error('Unable to find the end of the hermesFlags line in app build.gradle.');
    }
    return `${contents.slice(0, markerIndex)}${HERMES_FLAGS_LINE}${contents.slice(markerEnd + 1)}`;
  }
  return insertAfter(
    contents,
    '    hermesCommand = new File(["node", "--print", "require.resolve(\'react-native/package.json\')"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/sdks/hermesc/%OS-BIN%/hermesc"\n',
    HERMES_FLAGS_LINE,
    'hermesCommand',
  );
}

function upsertDependency(contents, dependencyLine) {
  if (contents.includes(dependencyLine.trim())) return contents;
  const anchor = 'dependencies {\n';
  const index = contents.indexOf(anchor);
  if (index === -1) throw new Error('Unable to find dependencies block in app build.gradle.');
  return contents.slice(0, index + anchor.length) + dependencyLine + contents.slice(index + anchor.length);
}

function upsertFfmpegKitPackage(contents) {
  const existingPattern = /^\s*ffmpegKitPackage\s*=.*$/m;
  if (existingPattern.test(contents)) {
    return contents.replace(existingPattern, FFMPEG_KIT_PACKAGE_LINE.trimEnd());
  }
  return insertAfter(
    contents,
    "        kotlinVersion = findProperty('android.kotlinVersion') ?: '1.9.25'\n",
    FFMPEG_KIT_PACKAGE_LINE,
    'kotlinVersion',
  );
}

function upsertFfmpegKitBootstrap(contents) {
  const allProjectsAnchor = 'allprojects {\n';
  const allProjectsIndex = contents.indexOf(allProjectsAnchor);
  if (allProjectsIndex === -1) throw new Error('Unable to find allprojects block in root build.gradle.');
  const existingStartIndex = [
    "def ffmpegKitRepoDir = new File(rootDir, '.gradle/ffmpeg-kit-repo')\n",
    "def ffmpegKitRepoDir = new File(rootDir, 'app/repo')\n",
  ].map((candidate) => contents.indexOf(candidate)).find((index) => index !== -1) ?? -1;
  const bootstrap = `${getFfmpegKitAndroidBootstrapSource().trimEnd()}\n\n`;
  const start = existingStartIndex === -1 ? allProjectsIndex : existingStartIndex;
  return `${contents.slice(0, start)}${bootstrap}${contents.slice(allProjectsIndex)}`;
}

function upsertFfmpegKitLocalRepo(contents) {
  const withoutExistingRepo = contents.split('\n')
    .filter((line) => line.trim() !== FFMPEG_KIT_LOCAL_REPO_LINE.trim())
    .join('\n');
  const anchor = 'allprojects {\n    repositories {\n';
  const index = withoutExistingRepo.indexOf(anchor);
  if (index === -1) throw new Error('Unable to find allprojects repositories block in root build.gradle.');
  return withoutExistingRepo.slice(0, index + anchor.length)
    + FFMPEG_KIT_LOCAL_REPO_LINE
    + withoutExistingRepo.slice(index + anchor.length);
}

module.exports = {
  COROUTINES_DEPENDENCY_LINE,
  upsertDependency,
  upsertFfmpegKitBootstrap,
  upsertFfmpegKitLocalRepo,
  upsertFfmpegKitPackage,
  upsertHermesFlags,
};
