from __future__ import annotations

import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from crop_ton_logo import read_png_rgba, write_png_rgba  # noqa: E402
from generate_logo_assets import (  # noqa: E402
    resize_rgba_area_premultiplied,
    write_ico_from_png,
)

EXPECTED_WINDOWS_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def parse_png_ihdr(png: bytes) -> tuple[int, int, int, int]:
    if not png.startswith(PNG_SIGNATURE):
        raise AssertionError("ICO frame is not a PNG")
    chunk_length = struct.unpack_from(">I", png, 8)[0]
    chunk_type = png[12:16]
    if chunk_type != b"IHDR" or chunk_length != 13:
        raise AssertionError("PNG frame does not start with a valid IHDR")
    width, height, bit_depth, color_type = struct.unpack_from(">IIBB", png, 16)
    return width, height, bit_depth, color_type


def parse_ico(path: Path) -> list[dict[str, object]]:
    data = path.read_bytes()
    reserved, image_type, count = struct.unpack_from("<HHH", data, 0)
    if (reserved, image_type) != (0, 1):
        raise AssertionError("Invalid ICO header")

    frames: list[dict[str, object]] = []
    for index in range(count):
        entry_offset = 6 + index * 16
        (
            width_byte,
            height_byte,
            color_count,
            entry_reserved,
            planes,
            bits_per_pixel,
            byte_length,
            image_offset,
        ) = struct.unpack_from("<BBBBHHII", data, entry_offset)
        payload = data[image_offset : image_offset + byte_length]
        if len(payload) != byte_length:
            raise AssertionError("ICO frame points outside the file")
        width, height, bit_depth, color_type = parse_png_ihdr(payload)
        frames.append(
            {
                "width_byte": width_byte,
                "height_byte": height_byte,
                "color_count": color_count,
                "reserved": entry_reserved,
                "planes": planes,
                "bits_per_pixel": bits_per_pixel,
                "width": width,
                "height": height,
                "bit_depth": bit_depth,
                "color_type": color_type,
                "payload": payload,
            }
        )
    return frames


class WindowsIconTests(unittest.TestCase):
    build_resources = ROOT / "packages/desktop/build-resources"

    def test_windows_ico_contains_exact_rgba_frames(self) -> None:
        frames = parse_ico(self.build_resources / "icon.ico")
        self.assertEqual([frame["width"] for frame in frames], EXPECTED_WINDOWS_SIZES)

        with tempfile.TemporaryDirectory() as temporary_directory:
            temp_root = Path(temporary_directory)
            for frame in frames:
                width = int(frame["width"])
                height = int(frame["height"])
                expected_byte = 0 if width == 256 else width
                self.assertEqual(frame["width_byte"], expected_byte)
                self.assertEqual(frame["height_byte"], expected_byte)
                self.assertEqual(width, height)
                self.assertEqual(frame["planes"], 1)
                self.assertEqual(frame["bits_per_pixel"], 32)
                self.assertEqual(frame["bit_depth"], 8)
                self.assertEqual(frame["color_type"], 6)
                self.assertEqual(frame["color_count"], 0)
                self.assertEqual(frame["reserved"], 0)

                extracted_path = temp_root / f"icon-{width}.png"
                extracted_path.write_bytes(frame["payload"])
                png_width, png_height, pixels = read_png_rgba(extracted_path)
                self.assertEqual((png_width, png_height), (width, height))
                corner_alpha = [
                    pixels[3],
                    pixels[(width - 1) * 4 + 3],
                    pixels[((height - 1) * width) * 4 + 3],
                    pixels[(width * height - 1) * 4 + 3],
                ]
                self.assertEqual(corner_alpha, [0, 0, 0, 0])
                alphas = pixels[3::4]
                self.assertTrue(any(alpha > 0 for alpha in alphas))
                self.assertTrue(any(0 < alpha < 255 for alpha in alphas))

    def test_tray_and_runtime_assets_are_valid_rgba_pngs(self) -> None:
        for file_name, expected_size in (
            ("tray-icon-16.png", 16),
            ("tray-icon-32.png", 32),
            ("icon.png", 1024),
        ):
            width, height, pixels = read_png_rgba(self.build_resources / file_name)
            self.assertEqual((width, height), (expected_size, expected_size))
            self.assertEqual(pixels[3], 0)
            self.assertTrue(any(alpha > 0 for alpha in pixels[3::4]))

    def test_package_uses_one_windows_ico_and_packages_runtime_assets(self) -> None:
        package = json.loads((ROOT / "packages/desktop/package.json").read_text())
        build = package["build"]
        self.assertEqual(build["win"]["icon"], "icon.ico")
        self.assertEqual(build["nsis"]["installerIcon"], "icon.ico")
        self.assertEqual(build["nsis"]["uninstallerIcon"], "icon.ico")

        resources = {
            (entry["from"], entry["to"])
            for entry in build["extraResources"]
        }
        self.assertIn(("build-resources/icon.png", "icon.png"), resources)
        self.assertIn(("build-resources/tray-icon-16.png", "tray-icon-16.png"), resources)
        self.assertIn(("build-resources/tray-icon-32.png", "tray-icon-32.png"), resources)

    def test_ico_writer_rejects_invalid_dimensions_and_duplicates(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            rectangular = root / "rectangular.png"
            oversized = root / "oversized.png"
            valid = root / "valid.png"
            write_png_rgba(rectangular, 16, 20, bytearray(16 * 20 * 4))
            write_png_rgba(oversized, 257, 257, bytearray(257 * 257 * 4))
            write_png_rgba(valid, 16, 16, bytearray(16 * 16 * 4))

            with self.assertRaisesRegex(ValueError, "square"):
                write_ico_from_png([rectangular], root / "rectangular.ico")
            with self.assertRaisesRegex(ValueError, "between 1 and 256"):
                write_ico_from_png([oversized], root / "oversized.ico")
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                write_ico_from_png([valid, valid], root / "duplicate.ico")

    def test_area_downsampling_uses_premultiplied_alpha(self) -> None:
        source = bytearray((255, 0, 0, 0, 0, 0, 255, 255))
        downsampled = resize_rgba_area_premultiplied(2, 1, source, 1, 1)
        self.assertEqual(tuple(downsampled), (0, 0, 255, 128))


if __name__ == "__main__":
    unittest.main()
