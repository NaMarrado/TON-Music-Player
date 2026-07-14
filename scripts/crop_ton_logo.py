#!/usr/bin/env python3

import argparse
import math
import shutil
from pathlib import Path

from png_rgba import read_png_rgba, write_png_rgba


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Detect the outer white ring, mask its exterior, and crop the PNG."
    )
    parser.add_argument("input", type=Path, help="Input RGBA PNG path")
    parser.add_argument("-o", "--output", type=Path, help="Output path; defaults to input")
    parser.add_argument("--backup", type=Path, help="Optional backup before overwriting input")
    parser.add_argument("--threshold", type=int, default=215)
    parser.add_argument("--padding", type=float, default=3.0)
    parser.add_argument("--feather", type=float, default=1.5)
    return parser.parse_args()


def detect_circle(
    width: int,
    height: int,
    pixels: bytearray,
    threshold: int,
) -> tuple[float, float, float]:
    min_x, min_y, max_x, max_y = width, height, -1, -1
    for y in range(height):
        row_offset = y * width * 4
        for x in range(width):
            index = row_offset + x * 4
            red, green, blue, alpha = pixels[index : index + 4]
            if alpha > 0 and min(red, green, blue) >= threshold:
                min_x, min_y = min(min_x, x), min(min_y, y)
                max_x, max_y = max(max_x, x), max(max_y, y)
    if max_x < 0 or max_y < 0:
        raise ValueError("Could not find any white border pixels. Try lowering --threshold.")
    return (
        (min_x + max_x) / 2.0,
        (min_y + max_y) / 2.0,
        max(max_x - min_x, max_y - min_y) / 2.0,
    )


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
        for x in range(width):
            index = (y * width + x) * 4
            distance = math.hypot(x - center_x, y - center_y)
            alpha = pixels[index + 3]
            if distance >= outer_radius:
                pixels[index + 3] = 0
            elif distance > inner_radius and alpha != 0:
                factor = (outer_radius - distance) / max(outer_radius - inner_radius, 1e-6)
                pixels[index + 3] = max(0, min(255, round(alpha * factor)))


def crop_square(
    width: int,
    height: int,
    pixels: bytearray,
    center_x: float,
    center_y: float,
    radius: float,
) -> tuple[int, int, bytearray]:
    left = max(0, math.floor(center_x - radius))
    top = max(0, math.floor(center_y - radius))
    right = min(width, math.ceil(center_x + radius + 1))
    bottom = min(height, math.ceil(center_y + radius + 1))
    new_width, new_height = right - left, bottom - top
    cropped = bytearray(new_width * new_height * 4)
    for y in range(new_height):
        source_start = ((top + y) * width + left) * 4
        destination_start = y * new_width * 4
        cropped[destination_start : destination_start + new_width * 4] = pixels[
            source_start : source_start + new_width * 4
        ]
    return new_width, new_height, cropped


def main() -> int:
    args = parse_args()
    output_path = args.output or args.input
    width, height, pixels = read_png_rgba(args.input)
    center_x, center_y, radius = detect_circle(width, height, pixels, args.threshold)
    cut_radius = radius + args.padding
    apply_circle_mask(width, height, pixels, center_x, center_y, cut_radius, args.feather)
    out_width, out_height, cropped = crop_square(
        width, height, pixels, center_x, center_y, cut_radius
    )
    if output_path == args.input and args.backup:
        args.backup.parent.mkdir(parents=True, exist_ok=True)
        if not args.backup.exists():
            shutil.copy2(args.input, args.backup)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_png_rgba(output_path, out_width, out_height, cropped)
    print(
        f"Wrote {output_path} ({out_width}x{out_height}) "
        f"center=({center_x:.2f},{center_y:.2f}) radius={radius:.2f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
