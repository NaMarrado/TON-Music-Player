#!/usr/bin/env python3

from __future__ import annotations

import argparse
import base64
import hashlib
import os
import secrets
import shutil
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
ANDROID_DIR = REPO_ROOT / "packages" / "mobile" / "android"
ANDROID_APP_BUILD_GRADLE = ANDROID_DIR / "app" / "build.gradle"
ANDROID_KEYSTORE = ANDROID_DIR / "app" / "release.keystore"
ANDROID_KEYSTORE_PROPERTIES = ANDROID_DIR / "keystore.properties"
LOCAL_SIGNING_DIR = REPO_ROOT / ".signing" / "android"
LOCAL_KEYSTORE = LOCAL_SIGNING_DIR / "ton-release.keystore"
LOCAL_KEYSTORE_PROPERTIES = LOCAL_SIGNING_DIR / "keystore.properties"
EXPECTED_CERTIFICATE_SHA256 = REPO_ROOT / "scripts" / "android-release-cert.sha256"
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


def write_keystore_properties(
    path: Path,
    store_password: str,
    key_alias: str,
    key_password: str,
) -> None:
    write_secure_text(
        path,
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


def read_keystore_properties(path: Path) -> dict[str, str]:
    properties: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        properties[key.strip()] = value.strip()

    required = ("storePassword", "keyAlias", "keyPassword")
    missing = [key for key in required if not properties.get(key)]
    if missing:
        raise SystemExit(
            f"Missing Android signing properties in {path}: {', '.join(missing)}"
        )
    return properties


def certificate_sha256(keystore: Path, store_password: str, key_alias: str) -> str:
    try:
        result = subprocess.run(
            [
                "keytool",
                "-exportcert",
                "-keystore",
                str(keystore),
                "-storepass",
                store_password,
                "-alias",
                key_alias,
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except subprocess.CalledProcessError as error:
        raise SystemExit(
            "Android keystore validation failed. Check the keystore, password, and alias."
        ) from error

    return hashlib.sha256(result.stdout).hexdigest()


def require_expected_certificate(actual_sha256: str) -> None:
    if not EXPECTED_CERTIFICATE_SHA256.exists():
        raise SystemExit(
            f"Missing expected Android signing certificate: {EXPECTED_CERTIFICATE_SHA256}"
        )

    expected_sha256 = EXPECTED_CERTIFICATE_SHA256.read_text(encoding="utf-8").strip().lower()
    if len(expected_sha256) != 64 or any(char not in "0123456789abcdef" for char in expected_sha256):
        raise SystemExit(
            f"Invalid Android certificate SHA-256 in {EXPECTED_CERTIFICATE_SHA256}"
        )
    if actual_sha256 != expected_sha256:
        raise SystemExit(
            "Android signing certificate does not match the permanent project key."
        )


def install_android_signing_files(
    source_keystore: Path,
    store_password: str,
    key_alias: str,
    key_password: str,
) -> None:
    ANDROID_KEYSTORE.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source_keystore, ANDROID_KEYSTORE)
    os.chmod(ANDROID_KEYSTORE, 0o600)
    write_keystore_properties(
        ANDROID_KEYSTORE_PROPERTIES,
        store_password,
        key_alias,
        key_password,
    )


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


def require_complete_signing_pair(
    keystore: Path,
    properties: Path,
    label: str,
) -> bool:
    keystore_exists = keystore.exists()
    properties_exists = properties.exists()
    if keystore_exists != properties_exists:
        raise SystemExit(
            f"{label} signing files are only partially present. Restore or remove "
            f"{keystore} and {properties} together."
        )
    return keystore_exists


def generate_local_release_keystore() -> None:
    store_password = secrets.token_urlsafe(24)
    key_password = store_password
    key_alias = "ton-release"

    LOCAL_SIGNING_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(LOCAL_SIGNING_DIR, 0o700)
    run(
        [
            "keytool",
            "-genkeypair",
            "-v",
            "-storetype",
            "PKCS12",
            "-keystore",
            str(LOCAL_KEYSTORE),
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
    os.chmod(LOCAL_KEYSTORE, 0o600)
    write_keystore_properties(
        LOCAL_KEYSTORE_PROPERTIES,
        store_password,
        key_alias,
        key_password,
    )


def ensure_android_release_keystore() -> str:
    local_exists = require_complete_signing_pair(
        LOCAL_KEYSTORE,
        LOCAL_KEYSTORE_PROPERTIES,
        "Local master Android",
    )
    generated_exists = require_complete_signing_pair(
        ANDROID_KEYSTORE,
        ANDROID_KEYSTORE_PROPERTIES,
        "Generated Android",
    )

    if not local_exists and generated_exists:
        LOCAL_SIGNING_DIR.mkdir(parents=True, exist_ok=True)
        os.chmod(LOCAL_SIGNING_DIR, 0o700)
        shutil.copyfile(ANDROID_KEYSTORE, LOCAL_KEYSTORE)
        shutil.copyfile(ANDROID_KEYSTORE_PROPERTIES, LOCAL_KEYSTORE_PROPERTIES)
        os.chmod(LOCAL_KEYSTORE, 0o600)
        os.chmod(LOCAL_KEYSTORE_PROPERTIES, 0o600)
        local_exists = True

    if not local_exists:
        generate_local_release_keystore()

    properties = read_keystore_properties(LOCAL_KEYSTORE_PROPERTIES)
    fingerprint = certificate_sha256(
        LOCAL_KEYSTORE,
        properties["storePassword"],
        properties["keyAlias"],
    )
    install_android_signing_files(
        LOCAL_KEYSTORE,
        properties["storePassword"],
        properties["keyAlias"],
        properties["keyPassword"],
    )
    return fingerprint


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required Android release signing secret: {name}")
    return value


def ensure_android_release_keystore_from_env() -> str:
    keystore_base64 = require_env(ANDROID_KEYSTORE_BASE64_ENV)
    store_password = require_env(ANDROID_KEYSTORE_PASSWORD_ENV)
    key_alias = require_env(ANDROID_KEY_ALIAS_ENV)
    key_password = require_env(ANDROID_KEY_PASSWORD_ENV)

    try:
        keystore_bytes = base64.b64decode("".join(keystore_base64.split()), validate=True)
    except Exception as error:
        raise SystemExit(f"{ANDROID_KEYSTORE_BASE64_ENV} is not valid base64: {error}") from error

    if not keystore_bytes:
        raise SystemExit(f"{ANDROID_KEYSTORE_BASE64_ENV} decoded to an empty file")

    ANDROID_KEYSTORE.parent.mkdir(parents=True, exist_ok=True)
    ANDROID_KEYSTORE.write_bytes(keystore_bytes)
    os.chmod(ANDROID_KEYSTORE, 0o600)
    write_keystore_properties(
        ANDROID_KEYSTORE_PROPERTIES,
        store_password,
        key_alias,
        key_password,
    )
    return certificate_sha256(ANDROID_KEYSTORE, store_password, key_alias)


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
        fingerprint = ensure_android_release_keystore_from_env()
        require_expected_certificate(fingerprint)
    else:
        fingerprint = ensure_android_release_keystore()

    print(f"Android app build file: {ANDROID_APP_BUILD_GRADLE}")
    print(f"Android release keystore: {ANDROID_KEYSTORE}")
    print(f"Android signing properties: {ANDROID_KEYSTORE_PROPERTIES}")
    print(f"Android signing certificate SHA-256: {fingerprint}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
