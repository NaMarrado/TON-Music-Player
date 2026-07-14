from android_signing_paths import ANDROID_APP_BUILD_GRADLE


def ensure_android_build_gradle_configured() -> None:
    if not ANDROID_APP_BUILD_GRADLE.exists():
        return
    contents = ANDROID_APP_BUILD_GRADLE.read_text(encoding="utf-8")
    if "def keystoreProperties = new Properties()" in contents:
        return
    original_contents = contents
    contents = contents.replace(
        'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()\n',
        (
            'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()\n'
            "def keystoreProperties = new Properties()\n"
            'def keystorePropertiesFile = rootProject.file("keystore.properties")\n\n'
            "if (keystorePropertiesFile.exists()) {\n"
            "    keystorePropertiesFile.withInputStream { stream ->\n"
            "        keystoreProperties.load(stream)\n"
            "    }\n"
            "}\n"
        ),
        1,
    )
    contents = contents.replace(
        "        debug {\n"
        "            storeFile file('debug.keystore')\n"
        "            storePassword 'android'\n"
        "            keyAlias 'androiddebugkey'\n"
        "            keyPassword 'android'\n"
        "        }\n",
        "        debug {\n"
        "            storeFile file('debug.keystore')\n"
        "            storePassword 'android'\n"
        "            keyAlias 'androiddebugkey'\n"
        "            keyPassword 'android'\n"
        "        }\n"
        "        if (!keystoreProperties.isEmpty()) {\n"
        "            release {\n"
        "                storeFile rootProject.file(keystoreProperties['storeFile'])\n"
        "                storePassword keystoreProperties['storePassword']\n"
        "                keyAlias keystoreProperties['keyAlias']\n"
        "                keyPassword keystoreProperties['keyPassword']\n"
        "            }\n"
        "        }\n",
        1,
    )
    contents = contents.replace(
        "        release {\n"
        "            // Caution! In production, you need to generate your own keystore file.\n"
        "            // see https://reactnative.dev/docs/signed-apk-android.\n"
        "            signingConfig signingConfigs.debug\n",
        "        release {\n"
        "            // Prefer a local release keystore when present, otherwise keep the old debug fallback.\n"
        '            signingConfig signingConfigs.findByName("release") ?: signingConfigs.debug\n',
        1,
    )
    if contents == original_contents:
        raise SystemExit(
            f"Unable to patch {ANDROID_APP_BUILD_GRADLE}. Android template may have changed."
        )
    ANDROID_APP_BUILD_GRADLE.write_text(contents, encoding="utf-8")
