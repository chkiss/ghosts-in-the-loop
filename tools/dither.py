#!/usr/bin/env python3
"""Atkinson 1-bit dither → amber, per SPEC §11 / ART_SPEC.md.

Every source image runs the same pass: grayscale → contrast stretch →
Atkinson error diffusion at target width → black stays transparent, white
becomes amber #FFB000. The CRT layers (scanlines, bloom) are CSS at render
time; they are NOT baked here.

Usage:
  python tools/dither.py <src_dir_or_zip> <out_dir> [--width N]

Requires: Pillow.
"""
import sys, os, zipfile, tempfile, argparse
from PIL import Image, ImageOps

AMBER = (255, 176, 0)


def atkinson(img: Image.Image) -> Image.Image:
    """1-bit Atkinson dither. Returns an 'L' image of 0/255."""
    px = img.load()
    w, h = img.size
    buf = [[float(px[x, y]) for x in range(w)] for y in range(h)]
    for y in range(h):
        for x in range(w):
            old = buf[y][x]
            new = 255.0 if old >= 128 else 0.0
            buf[y][x] = new
            err = (old - new) / 8.0
            for dx, dy in ((1, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (0, 2)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    buf[ny][nx] += err
    out = Image.new("L", (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            op[x, y] = 255 if buf[y][x] >= 128 else 0
    return out


def process(src: Image.Image, width: int) -> Image.Image:
    g = ImageOps.grayscale(src)
    g = ImageOps.autocontrast(g, cutoff=2)
    if g.width != width:
        g = g.resize((width, round(g.height * width / g.width)), Image.LANCZOS)
    bw = atkinson(g)
    # white → amber on transparent; black → transparent
    rgba = Image.new("RGBA", bw.size, (0, 0, 0, 0))
    rp, bp = rgba.load(), bw.load()
    for y in range(bw.height):
        for x in range(bw.width):
            if bp[x, y] >= 128:
                rp[x, y] = (*AMBER, 255)
    return rgba


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--width", type=int, default=384)
    a = ap.parse_args()

    tmp = None
    src_dir = a.src
    if a.src.endswith(".zip"):
        tmp = tempfile.mkdtemp()
        with zipfile.ZipFile(a.src) as z:
            z.extractall(tmp)
        src_dir = tmp

    os.makedirs(a.out, exist_ok=True)
    for fn in sorted(os.listdir(src_dir)):
        if not fn.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            continue
        src = Image.open(os.path.join(src_dir, fn)).convert("RGB")
        # seals stay square-small; wide scenes get more width
        width = a.width if fn.startswith("seal") else max(a.width, 512)
        out = process(src, width)
        base = os.path.splitext(fn)[0]
        out.save(os.path.join(a.out, base + ".png"))
        print("dithered", base, out.size)


if __name__ == "__main__":
    main()
