"""Re-cut RTS sprites whose art was sliced when it was taken from its sheet.

The sprites in public/sprites/rts/ were cut from the chroma-key sheets in
public/sprites/rts/sources/ on a fixed grid, so objects wider than their grid
cell lost a slice: either at the edge of the file, or inside it, where the cut
shows as a flat top or bottom (the hub/storage box lost its lower corner). This script finds each such sprite's object in its sheet
(objects are separated by background gaps; SHEET_ORDER names them), keys the
background out, and redraws it at the sprite's current scale and ground line,
centred horizontally. An object too wide for the file is shrunk to fit: the
script reports the factor, to compensate with `displayHeightTiles`.

Usage (Pillow only):  python3 scripts/sprites/recut_sprites.py [--check] [name ...]
  --check   list the sprites cut at the file edge or flat inside it, write nothing
  name      re-cut only these sprites (e.g. buildings/synthesizer); default: every cut sprite
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[2] / "public" / "sprites" / "rts"

# Sheet per sprite folder and its key colour.
SHEETS = {
    "buildings": ("sources/buildings-sheet.png", "green"),
    "resources": ("sources/resources-sheet.png", "magenta"),
    "terrain": ("sources/terrain-sheet.png", "magenta"),
}

# Objects on each sheet, row by row, left to right.
SHEET_ORDER = {
    "buildings": ["extractor", "storage", "solar_panel", "battery", "watchtower", "merger", "converter", "synthesizer"],
    "resources": [
        "regolith", "hydrogen", "oxygen", "iron_oxide",
        "aluminum_oxide", "silicon_dioxide", "nitrogen_gas", "water",
        "methane", "carbon_dioxide", "ammonia", "ceramic_plates",
    ],
    "terrain": ["crater", "regolith_scatter", "rock_seam", "deposit_overlay"],
}

OPAQUE = 16  # alpha above which a pixel counts as art
GAP = 24  # background run (sheet pixels) separating two objects
EDGE_MARGIN = 2  # keep re-cut art this far from the file edge
# A top or bottom whose two outermost rows span this share of the art width on
# average is a straight cut, not a drawn edge (intact sprites stay under 0.28;
# keep in sync with tests/assets/spriteEdges.test.ts).
FLAT_CUT_SHARE = 0.3


def keyness(rgb: tuple[int, int, int], key: str) -> int:
    r, g, b = rgb
    return g - max(r, b) if key == "green" else min(r, b) - g


def key_out(sheet: Image.Image, key: str) -> Image.Image:
    """RGBA copy of the sheet with the key colour transparent and edge spill removed."""
    rgb = sheet.convert("RGB")
    out = Image.new("RGBA", rgb.size)
    src = rgb.load()
    dst = out.load()
    w, h = rgb.size
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            k = keyness((r, g, b), key)
            alpha = 255 if k <= 40 else 0 if k >= 120 else round(255 * (120 - k) / 80)
            if alpha < 255 or k > 0:
                # Despill: no channel of the key colour above the others.
                if key == "green":
                    g = min(g, max(r, b))
                else:
                    r, b = min(r, g + 4), min(b, g + 4)
            dst[x, y] = (r, g, b, alpha)
    return out


def bands(profile: list[int]) -> list[tuple[int, int]]:
    """Runs of non-empty entries, merging runs separated by fewer than GAP empty ones."""
    runs: list[list[int]] = []
    for i, v in enumerate(profile):
        if not v:
            continue
        if runs and i - runs[-1][1] <= GAP:
            runs[-1][1] = i
        else:
            runs.append([i, i])
    return [(a, b + 1) for a, b in runs]


def objects(keyed: Image.Image) -> list[tuple[int, int, int, int]]:
    """Bounding boxes of the objects on a sheet: rows first, then columns within each row."""
    alpha = keyed.getchannel("A").point(lambda v: 255 if v > OPAQUE else 0)
    w, h = alpha.size
    rows = bands([alpha.crop((0, y, w, y + 1)).getbbox() is not None for y in range(h)])
    boxes = []
    for top, bottom in rows:
        row = alpha.crop((0, top, w, bottom))
        cols = bands([row.crop((x, 0, x + 1, bottom - top)).getbbox() is not None for x in range(w)])
        for left, right in cols:
            box = alpha.crop((left, top, right, bottom)).getbbox()
            if box:
                boxes.append((left + box[0], top + box[1], left + box[2], top + box[3]))
    return boxes


def opaque_box(img: Image.Image) -> tuple[int, int, int, int]:
    return img.getchannel("A").point(lambda v: 255 if v > OPAQUE else 0).getbbox()


def touches_edge(img: Image.Image) -> bool:
    l, t, r, b = opaque_box(img)
    w, h = img.size
    return l == 0 or t == 0 or r == w or b == h


def flat_cut_side(img: Image.Image) -> str | None:
    """'top' or 'bottom' when the art ends in a straight cut inside the file, else None."""
    alpha = img.getchannel("A").point(lambda v: 255 if v > OPAQUE else 0)
    l, t, r, b = alpha.getbbox()
    span = r - l

    def share(rows: tuple[int, int]) -> float:
        return sum(alpha.crop((l, y, r, y + 1)).histogram()[255] for y in rows) / (2 * span)

    if share((b - 1, b - 2)) > FLAT_CUT_SHARE:
        return "bottom"
    if share((t, t + 1)) > FLAT_CUT_SHARE:
        return "top"
    return None


def is_cut(img: Image.Image) -> bool:
    return touches_edge(img) or flat_cut_side(img) is not None


def match_colours(art: Image.Image, reference: Image.Image) -> Image.Image:
    """Maps each channel of `art` to the mean and spread of `reference` where both are opaque.

    Some sprites were graded (terrain decals darkened and desaturated) after the
    cut; this keeps a re-cut sprite in the same grade as the one it replaces.
    """
    both = ImageChops.multiply(art.getchannel("A"), reference.getchannel("A")).point(lambda v: 255 if v > 200 else 0)
    if not both.getbbox():
        return art
    art_stats = ImageStat.Stat(art.convert("RGB"), both)
    ref_stats = ImageStat.Stat(reference.convert("RGB"), both)
    channels = []
    for band, a_mean, a_std, r_mean, r_std in zip(
        art.convert("RGB").split(), art_stats.mean, art_stats.stddev, ref_stats.mean, ref_stats.stddev
    ):
        gain = r_std / a_std if a_std > 1 else 1.0
        channels.append(band.point(lambda v, g=gain, am=a_mean, rm=r_mean: max(0, min(255, round((v - am) * g + rm)))))
    graded = Image.merge("RGB", channels).convert("RGBA")
    graded.putalpha(art.getchannel("A"))
    return graded


def recut(sprite_path: Path, keyed: Image.Image, boxes: list[tuple[int, int, int, int]]) -> Image.Image:
    sprite = Image.open(sprite_path).convert("RGBA")
    order = SHEET_ORDER[sprite_path.parent.name]
    if len(boxes) != len(order):
        raise SystemExit(f"{sprite_path.parent.name} sheet: found {len(boxes)} objects, expected {len(order)}")
    box = boxes[order.index(sprite_path.stem)]
    obj = keyed.crop(box)

    l, t, r, b = opaque_box(sprite)
    w, h = sprite.size
    flat = flat_cut_side(sprite)
    # Current scale from an intact dimension; ground line from the sprite's bottom,
    # or from its top when the bottom is the cut (the art keeps its place and grows down).
    scale = (b - t) / obj.height if t > 0 and b < h and not flat else (r - l) / obj.width
    fit = min(1.0, (w - 2 * EDGE_MARGIN) / (obj.width * scale), (h - 2 * EDGE_MARGIN) / (obj.height * scale))
    scale *= fit
    art = obj.resize((round(obj.width * scale), round(obj.height * scale)), Image.LANCZOS)
    if flat == "bottom":
        bottom = min(t + art.height, h - EDGE_MARGIN)
    else:
        bottom = min(b, h - EDGE_MARGIN) if b < h else h - EDGE_MARGIN
    out = Image.new("RGBA", sprite.size)
    out.alpha_composite(art, ((w - art.width) // 2, max(EDGE_MARGIN, bottom - art.height)))
    out = match_colours(out, sprite)
    print(f"{sprite_path.relative_to(ROOT)}: sheet object {box}, scale {scale:.3f}"
          + (f", shrunk to fit ({fit:.2f})" if fit < 1 else ""))
    return out


def main(argv: list[str]) -> int:
    check = "--check" in argv
    names = [a for a in argv if not a.startswith("--")]
    sprites = sorted(p for folder in SHEETS for p in (ROOT / folder).glob("*.png"))
    cut = [p for p in sprites if is_cut(Image.open(p).convert("RGBA"))]
    if check:
        for p in cut:
            print(p.relative_to(ROOT))
        return 1 if cut else 0
    targets = [ROOT / f"{n}.png" for n in names] if names else cut
    keyed_sheets: dict[str, tuple[Image.Image, list]] = {}
    for path in targets:
        folder = path.parent.name
        if folder not in keyed_sheets:
            sheet_path, key = SHEETS[folder]
            keyed = key_out(Image.open(ROOT / sheet_path), key)
            keyed_sheets[folder] = (keyed, objects(keyed))
        keyed, boxes = keyed_sheets[folder]
        recut(path, keyed, boxes).save(path)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
