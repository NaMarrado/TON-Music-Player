#!/usr/bin/env python3

import argparse

from android_signing_gradle import ensure_android_build_gradle_configured
from android_signing_keystore import (
    ensure_android_release_keystore,
    ensure_android_release_keystore_from_env,
    require_expected_certificate,
)
from android_signing_paths import (
    ANDROID_APP_BUILD_GRADLE,
    ANDROID_KEYSTORE,
    ANDROID_KEYSTORE_PROPERTIES,
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
