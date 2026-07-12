#!/usr/bin/env python3

from __future__ import annotations

import argparse
import math
import shutil
import struct
import sys
import zlib
from pathlib import Path

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Detect the outer white ring in a PNG logo, make everything outside "
            "transparent, and crop tightly around the resulting circle."
        )
    )
    parser.add_argument("input", type=Path, help="Input RGBA PNG path")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output PNG path. Defaults to the input path.",
    )
    parser.add_argument(
        "--backup",
        type=Path,
        help="Optional backup path written before overwriting the input.",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=215,
        help="Minimum RGB channel value treated as the white border. Default: 215",
    )
    parser.add_argument(
        "--padding",
        type=float,
        default=3.0,
        help="Extra pixels preserved beyond the detected ring. Default: 3.0",
    )
    parser.add_argument(
        "--feather",
        type=float,
        default=1.5,
        help="Soft mask feather in pixels at the outer edge. Default: 1.5",
    )
    return parser.parse_args()


def read_chunk(raw: bytes, offset: int) -> tuple[bytes, bytes, int]:
    length = struct.unpack(">I", raw[offset : offset + 4])[0]
    chunk_type = raw[offset + 4 : offset + 8]
    start = offset + 8
    end = start + length
    data = raw[start:end]
    crc_end = end + 4
    return chunk_type, data, crc_end


def paeth_predictor(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def unfilter_scanlines(compressed: bytes, width: int, height: int) -> bytearray:
    bytes_per_pixel = 4
    stride = width * bytes_per_pixel
    expected_len = height * (stride + 1)
    raw = zlib.decompress(compressed)
    if len(raw) != expected_len:
        raise ValueError(
            f"Unexpected decompressed size: got {len(raw)}, expected {expected_len}"
        )

    pixels = bytearray(width * height * bytes_per_pixel)
    prev_row = bytearray(stride)

    for row in range(height):
        row_offset = row * (stride + 1)
        filter_type = raw[row_offset]
        filtered = raw[row_offset + 1 : row_offset + 1 + stride]
        out_row = bytearray(stride)

        for i in range(stride):
            left = out_row[i - bytes_per_pixel] if i >= bytes_per_pixel else 0
            up = prev_row[i]
            up_left = prev_row[i - bytes_per_pixel] if i >= bytes_per_pixel else 0
            value = filtered[i]

            if filter_type == 0:
                result = value
            elif filter_type == 1:
                result = (value + left) & 0xFF
            elif filter_type == 2:
                result = (value + up) & 0xFF
            elif filter_type == 3:
                result = (value + ((left + up) // 2)) & 0xFF
            elif filter_type == 4:
                result = (value + paeth_predictor(left, up, up_left)) & 0xFF
            else:
                raise ValueError(f"Unsupported PNG filter type: {filter_type}")

            out_row[i] = result

        start = row * stride
        pixels[start : start + stride] = out_row
        prev_row = out_row

    return pixels


def read_png_rgba(path: Path) -> tuple[int, int, bytearray]:
    raw = path.read_bytes()
    if not raw.startswith(PNG_SIGNATURE):
        raise ValueError(f"{path} is not a PNG file")

    offset = len(PNG_SIGNATURE)
    width = height = 0
    bit_depth = color_type = None
    idat_parts: list[bytes] = []

    while offset < len(raw):
        chunk_type, data, offset = read_chunk(raw, offset)
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, compression, flt, interlace = struct.unpack(
                ">IIBBBBB", data
            )
            if compression != 0 or flt != 0 or interlace != 0:
                raise ValueError("Unsupported PNG compression/filter/interlace settings")
            if bit_depth != 8 or color_type != 6:
                raise ValueError(
                    f"Only 8-bit RGBA PNGs are supported, got bit_depth={bit_depth}, "
                    f"color_type={color_type}"
                )
        elif chunk_type == b"IDAT":
            idat_parts.append(data)
        elif chunk_type == b"IEND":
            break

    if width <= 0 or height <= 0:
        raise ValueError(f"Missing IHDR in {path}")
    if not idat_parts:
        raise ValueError(f"Missing IDAT data in {path}")

    pixels = unfilter_scanlines(b"".join(idat_parts), width, height)
    return width, height, pixels


def make_chunk(chunk_type: bytes, data: bytes) -> bytes:
    head = struct.pack(">I", len(data)) + chunk_type + data
    crc = zlib.crc32(chunk_type)
    crc = zlib.crc32(data, crc)
    return head + struct.pack(">I", crc & 0xFFFFFFFF)


def write_png_rgba(path: Path, width: int, height: int, pixels: bytearray) -> None:
    stride = width * 4
    raw = bytearray()
    for row in range(height):
        raw.append(0)
        start = row * stride
        raw.extend(pixels[start : start + stride])

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), level=9)

    png = bytearray(PNG_SIGNATURE)
    png.extend(make_chunk(b"IHDR", ihdr))
    png.extend(make_chunk(b"IDAT", idat))
    png.extend(make_chunk(b"IEND", b""))
    path.write_bytes(png)


def is_white_border_pixel(r: int, g: int, b: int, a: int, threshold: int) -> bool:
    return a > 0 and r >= threshold and g >= threshold and b >= threshold


def detect_circle(width: int, height: int, pixels: bytearray, threshold: int) -> tuple[float, float, float]:
    min_x = width
    min_y = height
    max_x = -1
    max_y = -1

    for y in range(height):
        row_offset = y * width * 4
        for x in range(width):
            idx = row_offset + x * 4
            r, g, b, a = pixels[idx : idx + 4]
            if is_white_border_pixel(r, g, b, a, threshold):
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    if max_x < 0 or max_y < 0:
        raise ValueError(
            "Could not find any white border pixels. Try lowering --threshold."
        )

    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0
    radius = max(max_x - min_x, max_y - min_y) / 2.0
    return center_x, center_y, radius


def apply_circle_mask(
    width: int,
    height: int,
    pixels: bytearray,
    center_x: float,
    center_y: float,
    cut_radius: float,
    feather: float,
) -> None:
    inner_radius = max(cut_radius - feather, 0.0)
    outer_radius = cut_radius + feather

    for y in range(height):
        row_offset = y * width * 4
        for x in range(width):
            idx = row_offset + x * 4
            dist = math.hypot(x - center_x, y - center_y)
            alpha = pixels[idx + 3]

            if dist >= outer_radius:
                pixels[idx + 3] = 0
                continue

            if dist <= inner_radius or alpha == 0:
                continue

            factor = (outer_radius - dist) / max(outer_radius - inner_radius, 1e-6)
            pixels[idx + 3] = max(0, min(255, int(round(alpha * factor))))


def crop_square(
    width: int,
    height: int,
    pixels: bytearray,
    center_x: float,
    center_y: float,
    cut_radius: float,
) -> tuple[int, int, bytearray]:
    left = max(0, int(math.floor(center_x - cut_radius)))
    top = max(0, int(math.floor(center_y - cut_radius)))
    right = min(width, int(math.ceil(center_x + cut_radius + 1)))
    bottom = min(height, int(math.ceil(center_y + cut_radius + 1)))

    new_width = right - left
    new_height = bottom - top
    cropped = bytearray(new_width * new_height * 4)

    for y in range(new_height):
        src_start = ((top + y) * width + left) * 4
        src_end = src_start + new_width * 4
        dst_start = y * new_width * 4
        cropped[dst_start : dst_start + new_width * 4] = pixels[src_start:src_end]

    return new_width, new_height, cropped


def main() -> int:
    args = parse_args()
    input_path = args.input
    output_path = args.output or input_path

    width, height, pixels = read_png_rgba(input_path)
    center_x, center_y, radius = detect_circle(width, height, pixels, args.threshold)
    cut_radius = radius + args.padding
    apply_circle_mask(width, height, pixels, center_x, center_y, cut_radius, args.feather)
    out_width, out_height, cropped = crop_square(
        width, height, pixels, center_x, center_y, cut_radius
    )

    if output_path == input_path and args.backup:
        args.backup.parent.mkdir(parents=True, exist_ok=True)
        if not args.backup.exists():
            shutil.copy2(input_path, args.backup)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_png_rgba(output_path, out_width, out_height, cropped)

    print(
        f"Wrote {output_path} ({out_width}x{out_height}) "
        f"center=({center_x:.2f},{center_y:.2f}) radius={radius:.2f}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
