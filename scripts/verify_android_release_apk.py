#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path


CERTIFICATE_SHA256_PATTERN = re.compile(
    r"certificate SHA-256 digest:\s*([0-9a-f]{64})\s*$",
    re.IGNORECASE | re.MULTILINE,
)


def extract_certificate_sha256(output: str) -> frozenset[str]:
    digests = frozenset(
        match.lower() for match in CERTIFICATE_SHA256_PATTERN.findall(output)
    )
    if not digests:
        raise ValueError("apksigner output did not contain a certificate SHA-256 digest")
    return digests


def read_expected_sha256(path: Path) -> str:
    digest = path.read_text(encoding="utf-8").strip().lower()
    if len(digest) != 64 or any(character not in "0123456789abcdef" for character in digest):
        raise ValueError(f"Invalid certificate SHA-256 digest in {path}")
    return digest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apksigner", type=Path, required=True)
    parser.add_argument("--apk", type=Path, required=True)
    parser.add_argument("--expected", type=Path, required=True)
    args = parser.parse_args()

    result = subprocess.run(
        [str(args.apksigner), "verify", "--print-certs", str(args.apk)],
        check=False,
        capture_output=True,
        text=True,
    )
    output = "\n".join(part for part in (result.stdout, result.stderr) if part).strip()
    if output:
        print(output)
    if result.returncode != 0:
        raise SystemExit(f"apksigner verification failed with exit code {result.returncode}")

    try:
        actual_digests = extract_certificate_sha256(output)
        expected_digest = read_expected_sha256(args.expected)
    except ValueError as error:
        raise SystemExit(str(error)) from error

    if actual_digests != {expected_digest}:
        actual = ", ".join(sorted(actual_digests))
        raise SystemExit(
            f"Release APK certificate mismatch. Expected {expected_digest}; found {actual}."
        )

    print(f"Verified Android release certificate SHA-256: {expected_digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
