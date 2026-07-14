from __future__ import annotations

import struct
from pathlib import Path

from png_rgba import read_png_rgba
from logo_image import resize_rgba_area_premultiplied, write_icon

WINDOWS_ICON_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)
WINDOWS_LOGO_SCALE = 1.0


def write_ico_from_png(png_paths: list[Path], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not png_paths:
        raise ValueError("An ICO must contain at least one PNG frame")
    frames: list[tuple[bytes, int]] = []
    seen_sizes: set[int] = set()
    for png_path in png_paths:
        png_bytes = png_path.read_bytes()
        width, height, pixels = read_png_rgba(png_path)
        if width != height:
            raise ValueError(f"ICO frame must be square, got {width}x{height}: {png_path}")
        if width < 1 or width > 256:
            raise ValueError(f"ICO frame must be between 1 and 256 px: {png_path}")
        if width in seen_sizes:
            raise ValueError(f"Duplicate {width}px ICO frame: {png_path}")
        if len(pixels) != width * height * 4:
            raise ValueError(f"Invalid RGBA data for ICO frame: {png_path}")
        seen_sizes.add(width)
        frames.append((png_bytes, width))
    header = struct.pack("<HHH", 0, 1, len(frames))
    entries = bytearray()
    images = bytearray()
    image_offset = 6 + 16 * len(frames)
    for png_bytes, size in frames:
        dimension = 0 if size == 256 else size
        entries.extend(struct.pack(
            "<BBBBHHII",
            dimension,
            dimension,
            0,
            0,
            1,
            32,
            len(png_bytes),
            image_offset + len(images),
        ))
        images.extend(png_bytes)
    destination.write_bytes(header + entries + images)


def write_windows_icon_assets(
    desktop_build: Path,
    source_width: int,
    source_height: int,
    source_pixels: bytearray,
) -> None:
    frame_dir = desktop_build / "windows-icons"
    frame_dir.mkdir(parents=True, exist_ok=True)
    expected_names = {f"icon-{size}.png" for size in WINDOWS_ICON_SIZES}
    for stale_path in frame_dir.glob("icon-*.png"):
        if stale_path.name not in expected_names:
            stale_path.unlink()
    frame_paths = []
    for size in WINDOWS_ICON_SIZES:
        frame_path = frame_dir / f"icon-{size}.png"
        write_icon(
            frame_path,
            size,
            round(size * WINDOWS_LOGO_SCALE),
            source_width,
            source_height,
            source_pixels,
            (0, 0, 0, 0),
            resizer=resize_rgba_area_premultiplied,
        )
        frame_paths.append(frame_path)
    for size in (16, 32):
        write_icon(
            desktop_build / f"tray-icon-{size}.png",
            size,
            round(size * WINDOWS_LOGO_SCALE),
            source_width,
            source_height,
            source_pixels,
            (0, 0, 0, 0),
            resizer=resize_rgba_area_premultiplied,
        )
    write_ico_from_png(frame_paths, desktop_build / "icon.ico")
