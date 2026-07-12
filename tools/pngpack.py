#!/usr/bin/env python3
"""Re-encode the dithered art as 1-bit paletted PNG. Lossless; ~60% smaller.

Everything dither.py emits is two states per pixel — transparent, or one amber
— but it lands on disk as 32bpp RGBA, which is four bytes to say one bit. This
repacks those files as 1-bit palette + tRNS. Pixel-for-pixel identical output;
the browser decodes it to the same thing.

NOT for the sticky notes (public/art/notes): their ink is antialiased, and
hard-thresholding the alpha would leave the handwriting jagged.

Usage: python tools/pngpack.py [files…]   (default: public/art/*.png)
"""
import glob
import os
import sys

from PIL import Image


def pack(path: str) -> tuple[int, int]:
    im = Image.open(path).convert("RGBA")
    before = os.path.getsize(path)
    alpha = im.split()[3]
    levels = {v for v in alpha.getdata()}
    if levels - {0, 255}:
        print(f"skip {os.path.basename(path)}: soft alpha ({len(levels)} levels)")
        return before, before
    counts = im.getcolors(maxcolors=1 << 20) or []
    opaque = [c for c in counts if c[1][3] > 0]
    if len(opaque) != 1:
        print(f"skip {os.path.basename(path)}: {len(opaque)} ink colours, not 1")
        return before, before
    ink = opaque[0][1][:3]

    out = Image.new("P", im.size, 0)
    out.putpalette([0, 0, 0] + list(ink) + [0] * (254 * 3))
    out.putdata(bytes(1 if v else 0 for v in alpha.getdata()))
    out.save(path, "PNG", optimize=True, transparency=0, bits=1)
    return before, os.path.getsize(path)


if __name__ == "__main__":
    files = sys.argv[1:] or sorted(glob.glob("public/art/*.png"))
    b = a = 0
    for f in files:
        x, y = pack(f)
        b += x
        a += y
    print(f"{b:,} -> {a:,} bytes ({100 * (1 - a / b):.0f}% saved)")
