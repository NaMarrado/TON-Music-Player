from __future__ import annotations

from math import ceil, floor
from pathlib import Path

from png_rgba import write_png_rgba


def blank_canvas(width: int, height: int, rgba: tuple[int, int, int, int]) -> bytearray:
    r, g, b, a = rgba
    canvas = bytearray(width * height * 4)
    for index in range(0, len(canvas), 4):
        canvas[index : index + 4] = bytes((r, g, b, a))
    return canvas


def clamp(value: float, low: int, high: int) -> int:
    return max(low, min(high, int(value)))


def get_pixel(pixels: bytearray, width: int, x: int, y: int) -> tuple[int, int, int, int]:
    index = (y * width + x) * 4
    return tuple(pixels[index : index + 4])  # type: ignore[return-value]


def set_pixel(
    pixels: bytearray,
    width: int,
    x: int,
    y: int,
    rgba: tuple[int, int, int, int],
) -> None:
    index = (y * width + x) * 4
    pixels[index : index + 4] = bytes(rgba)


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
            corners = (
                get_pixel(src_pixels, src_width, x0, y0),
                get_pixel(src_pixels, src_width, x1, y0),
                get_pixel(src_pixels, src_width, x0, y1),
                get_pixel(src_pixels, src_width, x1, y1),
            )
            channels = []
            for channel in range(4):
                top = corners[0][channel] * (1 - wx) + corners[1][channel] * wx
                bottom = corners[2][channel] * (1 - wx) + corners[3][channel] * wx
                channels.append(max(0, min(255, round(top * (1 - wy) + bottom * wy))))
            set_pixel(dst_pixels, dst_width, x, y, tuple(channels))  # type: ignore[arg-type]
    return dst_pixels


def _area_contributions(src_size: int, dst_size: int) -> list[list[tuple[int, float]]]:
    if src_size <= 0 or dst_size <= 0:
        raise ValueError("Image dimensions must be positive")
    if dst_size > src_size:
        raise ValueError("Area resampling only supports downsampling")
    scale = src_size / dst_size
    contributions: list[list[tuple[int, float]]] = []
    for dst_index in range(dst_size):
        start = dst_index * scale
        end = (dst_index + 1) * scale
        covered = []
        for src_index in range(max(0, floor(start)), min(src_size, ceil(end))):
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
    """Area-downsample RGBA without leaking RGB from transparent pixels."""
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
            alpha_sum = red_sum = green_sum = blue_sum = 0.0
            for src_y, y_weight in source_rows:
                row_offset = src_y * src_width * 4
                for src_x, x_weight in source_columns:
                    offset = row_offset + src_x * 4
                    alpha = src_pixels[offset + 3]
                    if alpha == 0:
                        continue
                    weighted_alpha = alpha * x_weight * y_weight
                    alpha_sum += weighted_alpha
                    red_sum += src_pixels[offset] * weighted_alpha
                    green_sum += src_pixels[offset + 1] * weighted_alpha
                    blue_sum += src_pixels[offset + 2] * weighted_alpha
            if alpha_sum <= 0:
                continue
            destination = (dst_y * dst_width + dst_x) * 4
            dst_pixels[destination] = max(0, min(255, round(red_sum / alpha_sum)))
            dst_pixels[destination + 1] = max(0, min(255, round(green_sum / alpha_sum)))
            dst_pixels[destination + 2] = max(0, min(255, round(blue_sum / alpha_sum)))
            dst_pixels[destination + 3] = max(0, min(255, round(alpha_sum / pixel_area)))
    return dst_pixels


def alpha_blend(
    dst: tuple[int, int, int, int],
    src: tuple[int, int, int, int],
) -> tuple[int, int, int, int]:
    src_alpha = src[3] / 255.0
    dst_alpha = dst[3] / 255.0
    out_alpha = src_alpha + dst_alpha * (1 - src_alpha)
    if out_alpha <= 0:
        return (0, 0, 0, 0)
    channels = []
    for channel in range(3):
        value = (
            src[channel] * src_alpha
            + dst[channel] * dst_alpha * (1 - src_alpha)
        ) / out_alpha
        channels.append(max(0, min(255, round(value))))
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
            source = get_pixel(image_pixels, image_width, x, y)
            if source[3] == 0:
                continue
            dst_x, dst_y = offset_x + x, offset_y + y
            destination = get_pixel(canvas_pixels, canvas_width, dst_x, dst_y)
            set_pixel(canvas_pixels, canvas_width, dst_x, dst_y, alpha_blend(destination, source))
    return canvas_pixels


def build_monochrome_source(
    width: int,
    height: int,
    pixels: bytearray,
    threshold: int = 96,
) -> bytearray:
    monochrome = bytearray(width * height * 4)
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = get_pixel(pixels, width, x, y)
            brightness = max(red, green, blue)
            if alpha == 0 or brightness < threshold:
                continue
            set_pixel(monochrome, width, x, y, (255, 255, 255, round(alpha * brightness / 255)))
    return monochrome


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
    path.parent.mkdir(parents=True, exist_ok=True)
    scaled = resizer(source_width, source_height, source_pixels, logo_size, logo_size)
    canvas = blank_canvas(size, size, background)
    composite_center(size, size, canvas, logo_size, logo_size, scaled)
    write_png_rgba(path, size, size, canvas)
