"""Create small test images under tests/fixtures/images/ (run with the project .venv).
Usage: python tools/py/make_fixtures.py tests/fixtures/images
"""
import struct
import sys
import zlib
from pathlib import Path

from PIL import Image
from PIL.PngImagePlugin import PngInfo


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)


def main(out: Path):
    out.mkdir(parents=True, exist_ok=True)

    # 40x20 stored image, left half red / right half blue, EXIF Orientation=6 -> displays as 20x40.
    im = Image.new('RGB', (40, 20), (255, 0, 0))
    im.paste((0, 0, 255), (20, 0, 40, 20))
    exif = Image.Exif()
    exif[0x0112] = 6
    im.save(out / 'exif-rotated.jpg', quality=95, exif=exif.tobytes())

    # 16x16 RGBA with an alpha gradient (includes alpha 0 and 255).
    rgba = Image.new('RGBA', (16, 16))
    rgba.putdata([(200, 40, 40, (x * 17) % 256) for y in range(16) for x in range(16)])
    rgba.save(out / 'translucent.png')

    # Header-only PNG declaring 8000x8000 (64 MP, over the 50 MP decode limit, FR-223): rejected before decoding.
    ihdr = struct.pack('>IIBBBBB', 8000, 8000, 8, 2, 0, 0, 0)
    huge = b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', ihdr) + png_chunk(b'IEND', b'')
    (out / 'huge-header.png').write_bytes(huge)

    # Same pixels, different metadata.
    base = Image.new('RGB', (8, 8))
    base.putdata([((x * 31) % 256, (y * 29) % 256, (x * y * 7) % 256) for y in range(8) for x in range(8)])
    base.save(out / 'same-pixels-a.png')
    info = PngInfo()
    info.add_text('Comment', 'metadata only differs')
    base.save(out / 'same-pixels-b.png', pnginfo=info)

    # JPEG magic followed by garbage.
    (out / 'broken.jpg').write_bytes(b'\xff\xd8\xff\xe0' + bytes(range(256)) * 4)

    # A plain small photo-like PNG for generic tests.
    grad = Image.new('RGB', (64, 48))
    grad.putdata([(x * 4, y * 5, (x + y) * 2) for y in range(48) for x in range(64)])
    grad.save(out / 'gradient-64x48.png')


if __name__ == '__main__':
    main(Path(sys.argv[1]))
