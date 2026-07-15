from pathlib import Path

from logo_ico import WINDOWS_LOGO_SCALE, write_ico_from_png, write_windows_icon_assets
from logo_image import build_monochrome_source, write_icon

TRANSPARENT = (0, 0, 0, 0)


def write_desktop_assets(
    root: Path,
    width: int,
    height: int,
    pixels: bytearray,
) -> None:
    public = root / "packages/desktop/src/public"
    build = root / "packages/desktop/build-resources"
    for name, size, logo_size in (
        ("ton-mark.png", 256, 256),
        ("favicon-16x16.png", 16, 13),
        ("favicon-32x32.png", 32, 26),
        ("apple-touch-icon.png", 180, 146),
        ("icon-192x192.png", 192, 154),
        ("icon-512x512.png", 512, 410),
    ):
        write_icon(public / name, size, logo_size, width, height, pixels, TRANSPARENT)
    write_icon(
        build / "icon.png",
        1024,
        round(1024 * WINDOWS_LOGO_SCALE),
        width,
        height,
        pixels,
        TRANSPARENT,
    )
    write_icon(build / "dock-icon.png", 1024, 1024, width, height, pixels, TRANSPARENT)
    write_ico_from_png(
        [public / "favicon-16x16.png", public / "favicon-32x32.png"],
        public / "favicon.ico",
    )
    write_windows_icon_assets(build, width, height, pixels)


def write_mobile_assets(
    root: Path,
    width: int,
    height: int,
    pixels: bytearray,
    monochrome_pixels: bytearray,
) -> None:
    assets = root / "packages/mobile/assets"
    for name, logo_size, source in (
        ("icon.png", 820, pixels),
        ("adaptive-icon-foreground.png", 820, pixels),
        ("adaptive-icon-monochrome.png", 820, monochrome_pixels),
        ("splash-icon.png", 560, pixels),
    ):
        write_icon(assets / name, 1024, logo_size, width, height, source, TRANSPARENT)


def write_android_assets(
    root: Path,
    width: int,
    height: int,
    pixels: bytearray,
    monochrome_pixels: bytearray,
) -> None:
    resources = root / "packages/mobile/android/app/src/main/res"
    launcher_sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    adaptive_sizes = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
    splash_sizes = {"mdpi": 288, "hdpi": 432, "xhdpi": 576, "xxhdpi": 864, "xxxhdpi": 1152}
    for density, size in launcher_sizes.items():
        for name in ("ic_launcher.png", "ic_launcher_round.png"):
            write_icon(
                resources / f"mipmap-{density}/{name}",
                size,
                round(size * 0.8),
                width,
                height,
                pixels,
                TRANSPARENT,
            )
    for density, size in adaptive_sizes.items():
        for name, source in (
            ("ic_launcher_foreground.png", pixels),
            ("ic_launcher_monochrome.png", monochrome_pixels),
        ):
            write_icon(
                resources / f"drawable-{density}/{name}",
                size,
                round(size * 0.8),
                width,
                height,
                source,
                TRANSPARENT,
            )
    for density, size in splash_sizes.items():
        write_icon(
            resources / f"drawable-{density}/splashscreen_logo.png",
            size,
            round(size * 0.64),
            width,
            height,
            pixels,
            TRANSPARENT,
        )
    for pattern in ("mipmap-*/ic_launcher.webp", "mipmap-*/ic_launcher_round.webp"):
        for stale_path in resources.glob(pattern):
            stale_path.unlink(missing_ok=True)


def generate_logo_assets(root: Path, width: int, height: int, pixels: bytearray) -> None:
    monochrome = build_monochrome_source(width, height, pixels)
    write_desktop_assets(root, width, height, pixels)
    write_mobile_assets(root, width, height, pixels, monochrome)
    write_android_assets(root, width, height, pixels, monochrome)
