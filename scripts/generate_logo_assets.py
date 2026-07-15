#!/usr/bin/env python3

from pathlib import Path

from logo_asset_targets import generate_logo_assets
from logo_ico import write_ico_from_png
from logo_image import resize_rgba_area_premultiplied
from png_rgba import read_png_rgba

ROOT = Path(__file__).resolve().parents[1]
TRANSPARENT_LOGO = ROOT / "public/TONlogo.png"


def main() -> int:
    width, height, pixels = read_png_rgba(TRANSPARENT_LOGO)
    generate_logo_assets(ROOT, width, height, pixels)
    print("Generated TON logo assets for desktop, web, and mobile.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
