import struct
import zlib
from pathlib import Path

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def read_chunk(raw: bytes, offset: int) -> tuple[bytes, bytes, int]:
    length = struct.unpack(">I", raw[offset : offset + 4])[0]
    chunk_type = raw[offset + 4 : offset + 8]
    start = offset + 8
    end = start + length
    return chunk_type, raw[start:end], end + 4


def paeth_predictor(a: int, b: int, c: int) -> int:
    prediction = a + b - c
    distances = (abs(prediction - a), abs(prediction - b), abs(prediction - c))
    if distances[0] <= distances[1] and distances[0] <= distances[2]:
        return a
    return b if distances[1] <= distances[2] else c


def unfilter_scanlines(compressed: bytes, width: int, height: int) -> bytearray:
    bytes_per_pixel = 4
    stride = width * bytes_per_pixel
    raw = zlib.decompress(compressed)
    expected_length = height * (stride + 1)
    if len(raw) != expected_length:
        raise ValueError(
            f"Unexpected decompressed size: got {len(raw)}, expected {expected_length}"
        )
    pixels = bytearray(width * height * bytes_per_pixel)
    previous_row = bytearray(stride)
    for row in range(height):
        row_offset = row * (stride + 1)
        filter_type = raw[row_offset]
        filtered = raw[row_offset + 1 : row_offset + 1 + stride]
        output_row = bytearray(stride)
        for index in range(stride):
            left = output_row[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
            up = previous_row[index]
            up_left = previous_row[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
            value = filtered[index]
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
            output_row[index] = result
        start = row * stride
        pixels[start : start + stride] = output_row
        previous_row = output_row
    return pixels


def read_png_rgba(path: Path) -> tuple[int, int, bytearray]:
    raw = path.read_bytes()
    if not raw.startswith(PNG_SIGNATURE):
        raise ValueError(f"{path} is not a PNG file")
    offset = len(PNG_SIGNATURE)
    width = height = 0
    idat_parts = []
    while offset < len(raw):
        chunk_type, data, offset = read_chunk(raw, offset)
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, compression, filtering, interlace = struct.unpack(
                ">IIBBBBB", data
            )
            if compression != 0 or filtering != 0 or interlace != 0:
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
    return width, height, unfilter_scanlines(b"".join(idat_parts), width, height)


def make_chunk(chunk_type: bytes, data: bytes) -> bytes:
    head = struct.pack(">I", len(data)) + chunk_type + data
    crc = zlib.crc32(data, zlib.crc32(chunk_type))
    return head + struct.pack(">I", crc & 0xFFFFFFFF)


def write_png_rgba(path: Path, width: int, height: int, pixels: bytearray) -> None:
    stride = width * 4
    raw = bytearray()
    for row in range(height):
        raw.append(0)
        start = row * stride
        raw.extend(pixels[start : start + stride])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = bytearray(PNG_SIGNATURE)
    png.extend(make_chunk(b"IHDR", ihdr))
    png.extend(make_chunk(b"IDAT", zlib.compress(bytes(raw), level=9)))
    png.extend(make_chunk(b"IEND", b""))
    path.write_bytes(png)
