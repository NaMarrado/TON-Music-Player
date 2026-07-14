#!/usr/bin/env python3

from __future__ import annotations

import struct
from math import ceil, floor
from pathlib import Path

from crop_ton_logo import read_png_rgba, write_png_rgba

ROOT = Path(__file__).resolve().parents[1]
TRANSPARENT_LOGO = ROOT / "public/TONlogo.png"
WINDOWS_ICON_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)
WINDOWS_LOGO_SCALE = 1.0


def blank_canvas(width: int, height: int, rgba: tuple[int, int, int, int]) -> bytearray:
    r, g, b, a = rgba
    canvas = bytearray(width * height * 4)
    for index in range(0, len(canvas), 4):
        canvas[index] = r
        canvas[index + 1] = g
        canvas[index + 2] = b
        canvas[index + 3] = a
    return canvas


def clamp(value: float, low: int, high: int) -> int:
    return max(low, min(high, int(value)))


def get_pixel(pixels: bytearray, width: int, x: int, y: int) -> tuple[int, int, int, int]:
    idx = (y * width + x) * 4
    return tuple(pixels[idx : idx + 4])  # type: ignore[return-value]


def set_pixel(pixels: bytearray, width: int, x: int, y: int, rgba: tuple[int, int, int, int]) -> None:
    idx = (y * width + x) * 4
    pixels[idx : idx + 4] = bytes(rgba)


def resize_rgba(
    src_width: int,
    src_height: int,
    src_pixels: bytearray,
    dst_width: int,
    dst_height: int,
) -> bytearray:
    if src_width == dst_width and src_height == dst_height:
        return bytearray(src_pixels)

    dst_pixels = bytearray(dst_width * dst_height * 4)
    scale_x = src_width / dst_width
    scale_y = src_height / dst_height

    for y in range(dst_height):
        src_y = (y + 0.5) * scale_y - 0.5
        y0 = clamp(src_y, 0, src_height - 1)
        y1 = min(y0 + 1, src_height - 1)
        wy = src_y - y0

        for x in range(dst_width):
            src_x = (x + 0.5) * scale_x - 0.5
            x0 = clamp(src_x, 0, src_width - 1)
            x1 = min(x0 + 1, src_width - 1)
            wx = src_x - x0

            p00 = get_pixel(src_pixels, src_width, x0, y0)
            p10 = get_pixel(src_pixels, src_width, x1, y0)
            p01 = get_pixel(src_pixels, src_width, x0, y1)
            p11 = get_pixel(src_pixels, src_width, x1, y1)

            channels: list[int] = []
            for channel in range(4):
                top = p00[channel] * (1 - wx) + p10[channel] * wx
                bottom = p01[channel] * (1 - wx) + p11[channel] * wx
                value = round(top * (1 - wy) + bottom * wy)
                channels.append(max(0, min(255, value)))

            set_pixel(
                dst_pixels,
                dst_width,
                x,
                y,
                (channels[0], channels[1], channels[2], channels[3]),
            )

    return dst_pixels


def _area_contributions(src_size: int, dst_size: int) -> list[list[tuple[int, float]]]:
    """Return exact source-pixel coverage for every destination pixel."""
    if src_size <= 0 or dst_size <= 0:
        raise ValueError("Image dimensions must be positive")
    if dst_size > src_size:
        raise ValueError("Area resampling only supports downsampling")

    scale = src_size / dst_size
    contributions: list[list[tuple[int, float]]] = []
    for dst_index in range(dst_size):
        start = dst_index * scale
        end = (dst_index + 1) * scale
        covered: list[tuple[int, float]] = []
        first_source = max(0, floor(start))
        last_source = min(src_size, ceil(end))
        for src_index in range(first_source, last_source):
            weight = min(end, src_index + 1) - max(start, src_index)
            if weight > 0:
                covered.append((src_index, weight))
        contributions.append(covered)
    return contributions


def resize_rgba_area_premultiplied(
    src_width: int,
    src_height: int,
    src_pixels: bytearray,
    dst_width: int,
    dst_height: int,
) -> bytearray:
    """Area-downsample RGBA without leaking RGB from transparent pixels.

    RGB channels are accumulated after premultiplication by alpha, then
    unpremultiplied only once for the destination pixel. This is important for
    the thin white rings in the TON logo at Windows shell icon sizes.
    """
    if src_width == dst_width and src_height == dst_height:
        return bytearray(src_pixels)
    if len(src_pixels) != src_width * src_height * 4:
        raise ValueError("RGBA buffer length does not match its dimensions")

    x_contributions = _area_contributions(src_width, dst_width)
    y_contributions = _area_contributions(src_height, dst_height)
    pixel_area = (src_width / dst_width) * (src_height / dst_height)
    dst_pixels = bytearray(dst_width * dst_height * 4)

    for dst_y, source_rows in enumerate(y_contributions):
        for dst_x, source_columns in enumerate(x_contributions):
            alpha_sum = 0.0
            red_sum = 0.0
            green_sum = 0.0
            blue_sum = 0.0

            for src_y, y_weight in source_rows:
                row_offset = src_y * src_width * 4
                for src_x, x_weight in source_columns:
                    weight = x_weight * y_weight
                    offset = row_offset + src_x * 4
                    alpha = src_pixels[offset + 3]
                    if alpha == 0:
                        continue
                    weighted_alpha = alpha * weight
                    alpha_sum += weighted_alpha
                    red_sum += src_pixels[offset] * weighted_alpha
                    green_sum += src_pixels[offset + 1] * weighted_alpha
                    blue_sum += src_pixels[offset + 2] * weighted_alpha

            if alpha_sum <= 0:
                continue

            destination = (dst_y * dst_width + dst_x) * 4
            dst_pixels[destination] = max(0, min(255, round(red_sum / alpha_sum)))
            dst_pixels[destination + 1] = max(
                0, min(255, round(green_sum / alpha_sum))
            )
            dst_pixels[destination + 2] = max(
                0, min(255, round(blue_sum / alpha_sum))
            )
            dst_pixels[destination + 3] = max(
                0, min(255, round(alpha_sum / pixel_area))
            )

    return dst_pixels


def alpha_blend(
    dst: tuple[int, int, int, int], src: tuple[int, int, int, int]
) -> tuple[int, int, int, int]:
    src_alpha = src[3] / 255.0
    dst_alpha = dst[3] / 255.0
    out_alpha = src_alpha + dst_alpha * (1 - src_alpha)

    if out_alpha <= 0:
        return (0, 0, 0, 0)

    channels: list[int] = []
    for channel in range(3):
        out_channel = (
            src[channel] * src_alpha + dst[channel] * dst_alpha * (1 - src_alpha)
        ) / out_alpha
        channels.append(max(0, min(255, round(out_channel))))

    return (channels[0], channels[1], channels[2], round(out_alpha * 255))


def composite_center(
    canvas_width: int,
    canvas_height: int,
    canvas_pixels: bytearray,
    image_width: int,
    image_height: int,
    image_pixels: bytearray,
) -> bytearray:
    offset_x = (canvas_width - image_width) // 2
    offset_y = (canvas_height - image_height) // 2

    for y in range(image_height):
        for x in range(image_width):
            dst_x = offset_x + x
            dst_y = offset_y + y
            src_pixel = get_pixel(image_pixels, image_width, x, y)
            if src_pixel[3] == 0:
                continue
            dst_pixel = get_pixel(canvas_pixels, canvas_width, dst_x, dst_y)
            set_pixel(
                canvas_pixels,
                canvas_width,
                dst_x,
                dst_y,
                alpha_blend(dst_pixel, src_pixel),
            )

    return canvas_pixels


def build_monochrome_source(
    width: int, height: int, pixels: bytearray, threshold: int = 96
) -> bytearray:
    monochrome = bytearray(width * height * 4)

    for y in range(height):
        for x in range(width):
            r, g, b, a = get_pixel(pixels, width, x, y)
            brightness = max(r, g, b)
            if a == 0 or brightness < threshold:
                continue
            alpha = round(a * (brightness / 255.0))
            set_pixel(monochrome, width, x, y, (255, 255, 255, alpha))

    return monochrome


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def write_icon(
    path: Path,
    size: int,
    logo_size: int,
    source_width: int,
    source_height: int,
    source_pixels: bytearray,
    background: tuple[int, int, int, int],
    *,
    resizer=resize_rgba,
) -> None:
    ensure_parent(path)
    scaled = resizer(source_width, source_height, source_pixels, logo_size, logo_size)
    canvas = blank_canvas(size, size, background)
    composite_center(size, size, canvas, logo_size, logo_size, scaled)
    write_png_rgba(path, size, size, canvas)


def write_ico_from_png(png_paths: list[Path], dst: Path) -> None:
    ensure_parent(dst)
    count = len(png_paths)
    if count == 0:
        raise ValueError("An ICO must contain at least one PNG frame")

    frames: list[tuple[bytes, int]] = []
    seen_sizes: set[int] = set()
    for png_path in png_paths:
        png_bytes = png_path.read_bytes()
        width, height, pixels = read_png_rgba(png_path)
        if width != height:
            raise ValueError(
                f"ICO frame must be square, got {width}x{height}: {png_path}"
            )
        if width < 1 or width > 256:
            raise ValueError(f"ICO frame must be between 1 and 256 px: {png_path}")
        if width in seen_sizes:
            raise ValueError(f"Duplicate {width}px ICO frame: {png_path}")
        if len(pixels) != width * height * 4:
            raise ValueError(f"Invalid RGBA data for ICO frame: {png_path}")
        seen_sizes.add(width)
        frames.append((png_bytes, width))

    header = struct.pack("<HHH", 0, 1, count)
    entries = bytearray()
    images = bytearray()
    image_offset = 6 + 16 * count

    for png_bytes, size in frames:
        dimension_byte = 0 if size == 256 else size
        entries.extend(
            struct.pack(
                "<BBBBHHII",
                dimension_byte,
                dimension_byte,
                0,
                0,
                1,
                32,
                len(png_bytes),
                image_offset + len(images),
            )
        )
        images.extend(png_bytes)

    dst.write_bytes(header + entries + images)


def write_windows_icon_assets(
    desktop_build: Path,
    source_width: int,
    source_height: int,
    source_pixels: bytearray,
) -> None:
    """Create every Windows representation directly from the master logo."""
    transparent_bg = (0, 0, 0, 0)
    frame_dir = desktop_build / "windows-icons"
    frame_dir.mkdir(parents=True, exist_ok=True)
    expected_names = {f"icon-{size}.png" for size in WINDOWS_ICON_SIZES}
    for stale_path in frame_dir.glob("icon-*.png"):
        if stale_path.name not in expected_names:
            stale_path.unlink()

    frame_paths: list[Path] = []
    for size in WINDOWS_ICON_SIZES:
        frame_path = frame_dir / f"icon-{size}.png"
        write_icon(
            frame_path,
            size,
            round(size * WINDOWS_LOGO_SCALE),
            source_width,
            source_height,
            source_pixels,
            transparent_bg,
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
            transparent_bg,
            resizer=resize_rgba_area_premultiplied,
        )

    write_ico_from_png(frame_paths, desktop_build / "icon.ico")


def main() -> int:
    transparent_w, transparent_h, transparent_pixels = read_png_rgba(TRANSPARENT_LOGO)
    monochrome_pixels = build_monochrome_source(
        transparent_w, transparent_h, transparent_pixels
    )

    desktop_public = ROOT / "packages/desktop/src/public"
    desktop_build = ROOT / "packages/desktop/build-resources"
    mobile_assets = ROOT / "packages/mobile/assets"
    android_res = ROOT / "packages/mobile/android/app/src/main/res"

    transparent_bg = (0, 0, 0, 0)

    write_icon(
        desktop_public / "ton-mark.png",
        256,
        256,
        transparent_w,
        transparent_h,
        transparent_pixels,
        transparent_bg,
    )
    write_icon(
        desktop_public / "favicon-16x16.png",
        16,
        13,
        transparent_w,
        transparent_h,
        transparent_pixels,
        transparent_bg,
    )
    write_icon(
        desktop_public / "favicon-32x32.png",
        32,
        26,
        transparent_w,
        transparent_h,
        transparent_pixels,
        transparent_bg,
    )
    write_icon(
        desktop_public / "apple-touch-icon.png",
        180,
        146,
        transparent_w,
        transparent_h,
        transparent_pixels,
        transparent_bg,
    )
    write_icon(
        desktop_public / "icon-192x192.png",
        192,
        154,
        transparent_w,
        transparent_h,
        transparent_pixels,
        transparent_bg,
    )
    write_icon(
        desktop_public / "icon-512x512.png",
        512,
        410,
        transparent_w,
        transparent_h,
        transparent_pixels,
        transparent_bg,
    )

    write_icon(
        desktop_build / "icon.png",
        1024,
        round(1024 * WINDOWS_LOGO_SCALE),
        transparent_w,
        transparent_h,
        transparent_pixels,
        transparent_bg,
    )
    write_icon(
        desktop_build / "dock-icon.png",
        1024,
        1024,
        transparent_w,
        transparent_h,
        transparent_pixels,
        transparent_bg,
    )

    write_icon(
        mobile_assets / "icon.png",
        1024,
        820,
        transparent_w,
        transparent_h,
        transparent_pixels,
        transparent_bg,
    )
    write_icon(
        mobile_assets / "adaptive-icon-foreground.png",
        1024,
        820,
        transparent_w,
        transparent_h,
        transparent_pixels,
        transparent_bg,
    )
    write_icon(
        mobile_assets / "adaptive-icon-monochrome.png",
        1024,
        820,
        transparent_w,
        transparent_h,
        monochrome_pixels,
        transparent_bg,
    )
    write_icon(
        mobile_assets / "splash-icon.png",
        1024,
        560,
        transparent_w,
        transparent_h,
        transparent_pixels,
        transparent_bg,
    )

    launcher_sizes = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }
    adaptive_sizes = {
        "mdpi": 108,
        "hdpi": 162,
        "xhdpi": 216,
        "xxhdpi": 324,
        "xxxhdpi": 432,
    }
    splash_sizes = {
        "mdpi": 288,
        "hdpi": 432,
        "xhdpi": 576,
        "xxhdpi": 864,
        "xxxhdpi": 1152,
    }

    for density, size in launcher_sizes.items():
        write_icon(
            android_res / f"mipmap-{density}/ic_launcher.png",
            size,
            round(size * 0.8),
            transparent_w,
            transparent_h,
            transparent_pixels,
            transparent_bg,
        )
        write_icon(
            android_res / f"mipmap-{density}/ic_launcher_round.png",
            size,
            round(size * 0.8),
            transparent_w,
            transparent_h,
            transparent_pixels,
            transparent_bg,
        )

    for density, size in adaptive_sizes.items():
        write_icon(
            android_res / f"drawable-{density}/ic_launcher_foreground.png",
            size,
            round(size * 0.8),
            transparent_w,
            transparent_h,
            transparent_pixels,
            transparent_bg,
        )
        write_icon(
            android_res / f"drawable-{density}/ic_launcher_monochrome.png",
            size,
            round(size * 0.8),
            transparent_w,
            transparent_h,
            monochrome_pixels,
            transparent_bg,
        )

    for density, size in splash_sizes.items():
        write_icon(
            android_res / f"drawable-{density}/splashscreen_logo.png",
            size,
            round(size * 0.64),
            transparent_w,
            transparent_h,
            transparent_pixels,
            transparent_bg,
        )

    for stale_path in android_res.glob("mipmap-*/ic_launcher.webp"):
        stale_path.unlink(missing_ok=True)
    for stale_path in android_res.glob("mipmap-*/ic_launcher_round.webp"):
        stale_path.unlink(missing_ok=True)

    write_ico_from_png(
        [desktop_public / "favicon-16x16.png", desktop_public / "favicon-32x32.png"],
        desktop_public / "favicon.ico",
    )
    write_windows_icon_assets(
        desktop_build,
        transparent_w,
        transparent_h,
        transparent_pixels,
    )

    print("Generated TON logo assets for desktop, web, and mobile.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
