import base64
import hashlib
import os
import secrets
import shutil
import subprocess
from pathlib import Path

from android_signing_paths import (
    ANDROID_KEY_ALIAS_ENV,
    ANDROID_KEY_PASSWORD_ENV,
    ANDROID_KEYSTORE,
    ANDROID_KEYSTORE_BASE64_ENV,
    ANDROID_KEYSTORE_PASSWORD_ENV,
    ANDROID_KEYSTORE_PROPERTIES,
    EXPECTED_CERTIFICATE_SHA256,
    LOCAL_KEYSTORE,
    LOCAL_KEYSTORE_PROPERTIES,
    LOCAL_SIGNING_DIR,
)


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
    write_secure_text(path, "\n".join([
        "storeFile=app/release.keystore",
        f"storePassword={store_password}",
        f"keyAlias={key_alias}",
        f"keyPassword={key_password}",
        "",
    ]), 0o600)


def read_keystore_properties(path: Path) -> dict[str, str]:
    properties = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            properties[key.strip()] = value.strip()
    required = ("storePassword", "keyAlias", "keyPassword")
    missing = [key for key in required if not properties.get(key)]
    if missing:
        raise SystemExit(f"Missing Android signing properties in {path}: {', '.join(missing)}")
    return properties


def certificate_sha256(keystore: Path, store_password: str, key_alias: str) -> str:
    try:
        result = subprocess.run([
            "keytool", "-exportcert", "-keystore", str(keystore),
            "-storepass", store_password, "-alias", key_alias,
        ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as error:
        raise SystemExit(
            "Android keystore validation failed. Check the keystore, password, and alias."
        ) from error
    return hashlib.sha256(result.stdout).hexdigest()


def require_expected_certificate(actual_sha256: str) -> None:
    if not EXPECTED_CERTIFICATE_SHA256.exists():
        raise SystemExit(f"Missing expected Android signing certificate: {EXPECTED_CERTIFICATE_SHA256}")
    expected = EXPECTED_CERTIFICATE_SHA256.read_text(encoding="utf-8").strip().lower()
    if len(expected) != 64 or any(char not in "0123456789abcdef" for char in expected):
        raise SystemExit(f"Invalid Android certificate SHA-256 in {EXPECTED_CERTIFICATE_SHA256}")
    if actual_sha256 != expected:
        raise SystemExit("Android signing certificate does not match the permanent project key.")


def install_android_signing_files(
    source_keystore: Path,
    store_password: str,
    key_alias: str,
    key_password: str,
) -> None:
    ANDROID_KEYSTORE.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source_keystore, ANDROID_KEYSTORE)
    os.chmod(ANDROID_KEYSTORE, 0o600)
    write_keystore_properties(ANDROID_KEYSTORE_PROPERTIES, store_password, key_alias, key_password)


def require_complete_signing_pair(keystore: Path, properties: Path, label: str) -> bool:
    if keystore.exists() != properties.exists():
        raise SystemExit(
            f"{label} signing files are only partially present. Restore or remove "
            f"{keystore} and {properties} together."
        )
    return keystore.exists()


def generate_local_release_keystore() -> None:
    password = secrets.token_urlsafe(24)
    alias = "ton-release"
    LOCAL_SIGNING_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(LOCAL_SIGNING_DIR, 0o700)
    subprocess.run([
        "keytool", "-genkeypair", "-v", "-storetype", "PKCS12",
        "-keystore", str(LOCAL_KEYSTORE), "-storepass", password,
        "-keypass", password, "-alias", alias, "-keyalg", "RSA",
        "-keysize", "4096", "-validity", "9125",
        "-dname", "CN=TON, OU=Open Source, O=NaMarrado, L=Prague, ST=Prague, C=CZ",
        "-noprompt",
    ], check=True)
    os.chmod(LOCAL_KEYSTORE, 0o600)
    write_keystore_properties(LOCAL_KEYSTORE_PROPERTIES, password, alias, password)


def ensure_android_release_keystore() -> str:
    local_exists = require_complete_signing_pair(
        LOCAL_KEYSTORE, LOCAL_KEYSTORE_PROPERTIES, "Local master Android"
    )
    generated_exists = require_complete_signing_pair(
        ANDROID_KEYSTORE, ANDROID_KEYSTORE_PROPERTIES, "Generated Android"
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
        LOCAL_KEYSTORE, properties["storePassword"], properties["keyAlias"]
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
    encoded = require_env(ANDROID_KEYSTORE_BASE64_ENV)
    store_password = require_env(ANDROID_KEYSTORE_PASSWORD_ENV)
    key_alias = require_env(ANDROID_KEY_ALIAS_ENV)
    key_password = require_env(ANDROID_KEY_PASSWORD_ENV)
    try:
        keystore_bytes = base64.b64decode("".join(encoded.split()), validate=True)
    except Exception as error:
        raise SystemExit(f"{ANDROID_KEYSTORE_BASE64_ENV} is not valid base64: {error}") from error
    if not keystore_bytes:
        raise SystemExit(f"{ANDROID_KEYSTORE_BASE64_ENV} decoded to an empty file")
    ANDROID_KEYSTORE.parent.mkdir(parents=True, exist_ok=True)
    ANDROID_KEYSTORE.write_bytes(keystore_bytes)
    os.chmod(ANDROID_KEYSTORE, 0o600)
    write_keystore_properties(ANDROID_KEYSTORE_PROPERTIES, store_password, key_alias, key_password)
    return certificate_sha256(ANDROID_KEYSTORE, store_password, key_alias)
