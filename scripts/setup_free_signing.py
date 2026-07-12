#!/usr/bin/env python3

from __future__ import annotations

import argparse
import base64
import os
import secrets
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
ANDROID_DIR = REPO_ROOT / "packages" / "mobile" / "android"
ANDROID_APP_BUILD_GRADLE = ANDROID_DIR / "app" / "build.gradle"
ANDROID_KEYSTORE = ANDROID_DIR / "app" / "release.keystore"
ANDROID_KEYSTORE_PROPERTIES = ANDROID_DIR / "keystore.properties"
ANDROID_KEYSTORE_BASE64_ENV = "TON_ANDROID_KEYSTORE_BASE64"
ANDROID_KEYSTORE_PASSWORD_ENV = "TON_ANDROID_KEYSTORE_PASSWORD"
ANDROID_KEY_ALIAS_ENV = "TON_ANDROID_KEY_ALIAS"
ANDROID_KEY_PASSWORD_ENV = "TON_ANDROID_KEY_PASSWORD"


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def write_secure_text(path: Path, contents: str, mode: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(contents, encoding="utf-8")
    os.chmod(path, mode)


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
            'def keystorePropertiesFile = rootProject.file("keystore.properties")\n'
            "\n"
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
        '            // Prefer a local release keystore when present, otherwise keep the old debug fallback.\n'
        '            signingConfig signingConfigs.findByName("release") ?: signingConfigs.debug\n',
        1,
    )

    if contents == original_contents:
        raise SystemExit(
            f"Unable to patch {ANDROID_APP_BUILD_GRADLE}. Android template may have changed."
        )

    ANDROID_APP_BUILD_GRADLE.write_text(contents, encoding="utf-8")


def ensure_android_release_keystore() -> None:
    keystore_exists = ANDROID_KEYSTORE.exists()
    properties_exists = ANDROID_KEYSTORE_PROPERTIES.exists()

    if keystore_exists and properties_exists:
        return

    if keystore_exists != properties_exists:
        raise SystemExit(
            "Android signing files are only partially present. Restore or remove "
            f"{ANDROID_KEYSTORE} and {ANDROID_KEYSTORE_PROPERTIES} together."
        )

    store_password = secrets.token_urlsafe(24)
    key_password = store_password
    key_alias = "ton-release"

    ANDROID_KEYSTORE.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            "keytool",
            "-genkeypair",
            "-v",
            "-storetype",
            "PKCS12",
            "-keystore",
            str(ANDROID_KEYSTORE),
            "-storepass",
            store_password,
            "-keypass",
            key_password,
            "-alias",
            key_alias,
            "-keyalg",
            "RSA",
            "-keysize",
            "4096",
            "-validity",
            "9125",
            "-dname",
            "CN=TON, OU=Open Source, O=NaMarrado, L=Prague, ST=Prague, C=CZ",
            "-noprompt",
        ]
    )
    os.chmod(ANDROID_KEYSTORE, 0o600)

    write_secure_text(
        ANDROID_KEYSTORE_PROPERTIES,
        "\n".join(
            [
                "storeFile=app/release.keystore",
                f"storePassword={store_password}",
                f"keyAlias={key_alias}",
                f"keyPassword={key_password}",
                "",
            ]
        ),
        0o600,
    )


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required Android release signing secret: {name}")
    return value


def ensure_android_release_keystore_from_env() -> None:
    keystore_base64 = require_env(ANDROID_KEYSTORE_BASE64_ENV)
    store_password = require_env(ANDROID_KEYSTORE_PASSWORD_ENV)
    key_alias = require_env(ANDROID_KEY_ALIAS_ENV)
    key_password = require_env(ANDROID_KEY_PASSWORD_ENV)

    try:
        keystore_bytes = base64.b64decode("".join(keystore_base64.split()), validate=True)
    except Exception as error:
        raise SystemExit(f"{ANDROID_KEYSTORE_BASE64_ENV} is not valid base64: {error}") from error

    ANDROID_KEYSTORE.parent.mkdir(parents=True, exist_ok=True)
    ANDROID_KEYSTORE.write_bytes(keystore_bytes)
    os.chmod(ANDROID_KEYSTORE, 0o600)

    write_secure_text(
        ANDROID_KEYSTORE_PROPERTIES,
        "\n".join(
            [
                "storeFile=app/release.keystore",
                f"storePassword={store_password}",
                f"keyAlias={key_alias}",
                f"keyPassword={key_password}",
                "",
            ]
        ),
        0o600,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--ci",
        action="store_true",
        help="Require Android release signing secrets instead of generating a local keystore.",
    )
    args = parser.parse_args()

    ensure_android_build_gradle_configured()
    if args.ci:
        ensure_android_release_keystore_from_env()
    else:
        ensure_android_release_keystore()

    print(f"Android app build file: {ANDROID_APP_BUILD_GRADLE}")
    print(f"Android release keystore: {ANDROID_KEYSTORE}")
    print(f"Android signing properties: {ANDROID_KEYSTORE_PROPERTIES}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
