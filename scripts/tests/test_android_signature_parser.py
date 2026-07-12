from __future__ import annotations

import unittest

from scripts.verify_android_release_apk import extract_certificate_sha256


DIGEST = "ad4587308d0492e061ce0b7a03e8fe21c2c8676287a5b034c107401c1f516704"


class AndroidSignatureParserTest(unittest.TestCase):
    def test_parses_standard_apksigner_output(self) -> None:
        output = f"Signer #1 certificate SHA-256 digest: {DIGEST}"
        self.assertEqual(extract_certificate_sha256(output), frozenset({DIGEST}))

    def test_parses_v2_apksigner_output(self) -> None:
        output = f"V2 Signer: certificate SHA-256 digest: {DIGEST}"
        self.assertEqual(extract_certificate_sha256(output), frozenset({DIGEST}))

    def test_deduplicates_same_certificate_from_multiple_schemes(self) -> None:
        output = "\n".join(
            [
                f"V2 Signer: certificate SHA-256 digest: {DIGEST}",
                f"V3 Signer: certificate SHA-256 digest: {DIGEST.upper()}",
            ]
        )
        self.assertEqual(extract_certificate_sha256(output), frozenset({DIGEST}))

    def test_rejects_output_without_certificate_digest(self) -> None:
        with self.assertRaisesRegex(ValueError, "did not contain"):
            extract_certificate_sha256("Verifies")


if __name__ == "__main__":
    unittest.main()
