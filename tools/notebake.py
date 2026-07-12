#!/usr/bin/env python3
"""Bake a sticky-note PNG from a language-native handwriting font.

The notes on the monitor bezel are pre-rendered so a player never waits on a
webfont, and so Urdu/Devanagari/Hebrew shape correctly on every browser. Ink
is black on transparent; the amber paper underneath is CSS (.bezel-note).

Shaping matters here: Urdu is Nastaliq (Gulzar) and joins; Devanagari (Kalam)
has conjuncts. PIL must be built with raqm — check features.check('raqm').

Usage:
  python tools/notebake.py pk    # re-bake one note
  python tools/notebake.py       # list what it knows how to bake

Requires: Pillow with raqm, fontTools + brotli (to un-woff2 the fonts).
"""
import os
import sys
import io

from PIL import Image, ImageDraw, ImageFont, features
from fontTools.ttLib import TTFont

SIZE = 560          # square, same as every other note
INK = (0, 0, 0, 255)
# Build-time only: these never ship. The notes are baked to PNG precisely so a
# player never downloads a 200 KB Nastaliq face to read two words on a bezel.
FONTS = "tools/fonts"
OUT = "public/art/notes"

# id -> (text, woff2 file, point size, direction, language, slant)
# `slant` shears the baked ink to the right. Devanagari handwriting leans; the
# fonts don't, because there is no libre italic Devanagari hand.
NOTES = {
    # Urdu is Nastaliq, not Naskh. Gulzar is the full-coverage bake.
    "pk": ("ماشاء اللہ", "gulzar-full.woff2", 96, "rtl", "ur", 0.0),
    # Kalam LIGHT — the Bold cut reads as painted signage, not as a scrawl.
    # Terse, too: a note to yourself skips the polite imperative (…करें).
    "in": ("लाइट बंद!", "kalam-light.woff2", 116, "ltr", "hi", 0.16),
}


def load(woff2: str, pt: int) -> ImageFont.FreeTypeFont:
    """woff2 -> in-memory ttf -> PIL font. Pillow can't read woff2 directly."""
    f = TTFont(os.path.join(FONTS, woff2))
    buf = io.BytesIO()
    f.flavor = None          # drop woff2 compression, emit plain sfnt
    f.save(buf)
    buf.seek(0)
    return ImageFont.truetype(buf, pt)


def word_image(word: str, font, direction: str, lang: str) -> Image.Image:
    pad = SIZE // 2
    canvas = Image.new("RGBA", (SIZE * 2, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).text((pad, SIZE // 2), word, font=font, fill=INK,
                                anchor="lm", direction=direction, language=lang)
    return canvas.crop(canvas.getbbox())


def draw_shirorekha(word: Image.Image, weight: int) -> Image.Image:
    """Join the per-glyph headline bars into one stroke, and overshoot it.

    A typeface carries the shirorekha inside each glyph, so a word comes out as
    a row of separate little roofs. A hand draws the line once, across the whole
    word, usually running past the last letter. That single stroke is most of
    what makes Devanagari read as written rather than set.
    """
    a = word.load()
    w, h = word.size
    # the headline is the densest ink row in the upper part of the word
    best, best_n = 0, -1
    for y in range(0, int(h * 0.45)):
        n = sum(1 for x in range(w) if a[x, y][3] > 128)
        if n > best_n:
            best, best_n = y, n
    out = Image.new("RGBA", (w + 12, h), (0, 0, 0, 0))
    out.paste(word, (6, 0), word)
    d = ImageDraw.Draw(out)
    d.rectangle([2, best, w + 9, best + weight - 1], fill=INK)  # overshoots both ends
    return out


def bake(note_id: str) -> None:
    text, woff2, pt, direction, lang, slant = NOTES[note_id]
    font = load(woff2, pt)
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if lang == "hi":
        # Devanagari: lay the words out by hand so each gets one continuous
        # headline, and open the word gaps a little. A note is written loose.
        words = [draw_shirorekha(word_image(t, font, direction, lang), max(3, pt // 34))
                 for t in text.split(" ")]
        gap = round(pt * 0.34)
        total = sum(x.width for x in words) + gap * (len(words) - 1)
        x = (SIZE - total) // 2
        top = max(w.size[1] for w in words)
        for wimg in words:
            img.paste(wimg, (x, (SIZE - top) // 2), wimg)
            x += wimg.width + gap
    else:
        # Nastaliq hangs far below the baseline; anchor on the middle so tall
        # descenders don't walk off the paper.
        d.text((SIZE // 2, SIZE // 2), text, font=font, fill=INK,
               anchor="mm", direction=direction, language=lang)
    if slant:
        img = img.transform(img.size, Image.AFFINE, (1, slant, -slant * SIZE / 2, 0, 1, 0),
                            resample=Image.BICUBIC)
    # Trim to ink, then re-center with a generous margin: the note is small
    # on screen and the words must fill it.
    box = img.getbbox()
    if box:
        ink = img.crop(box)
        margin = 56
        scale = min((SIZE - 2 * margin) / ink.width, (SIZE - 2 * margin) / ink.height, 1.6)
        ink = ink.resize((round(ink.width * scale), round(ink.height * scale)), Image.LANCZOS)
        img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        img.paste(ink, ((SIZE - ink.width) // 2, (SIZE - ink.height) // 2), ink)
    img.save(os.path.join(OUT, f"note_{note_id}.png"))
    print(f"baked note_{note_id}  '{text}'  {woff2}")


if __name__ == "__main__":
    if not features.check("raqm"):
        sys.exit("Pillow has no raqm: Urdu/Devanagari will not shape. Install libraqm.")
    ids = sys.argv[1:] or sorted(NOTES)
    for i in ids:
        bake(i)
