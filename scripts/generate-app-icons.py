"""Generate the vector master and matching PNG home-screen icons, using stdlib only."""

from math import atan2, cos, pi, sin, hypot
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1] / "icons"
ROOT.mkdir(exist_ok=True)
SIZE = 512
COLORS = [
    "#dbeafe", "#dfe4ff", "#ede4ff", "#fae2f0", "#ffe3e8", "#ffead3",
    "#fff3c7", "#e9f7c8", "#d0f7e7", "#caf3ed", "#cff4f8", "#dceffc",
]
BG, WHITE, EDGE, DARK, ORANGE = "#f8fbff", "#ffffff", "#d8e4f2", "#19365b", "#f59e0b"


def point(radius, degrees):
    angle = degrees * pi / 180
    return f"{256 + radius * cos(angle):.3f},{256 + radius * sin(angle):.3f}"


wedges = []
for i, color in enumerate(COLORS):
    start, end = -89 + i * 30, -61 + i * 30
    wedges.append(
        f'<path d="M {point(181, start)} A 181 181 0 0 1 {point(181, end)} '
        f'L {point(87, end)} A 87 87 0 0 0 {point(87, start)} Z" fill="{color}"/>'
    )

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Årshjulet">
<rect width="512" height="512" fill="{BG}"/>
<circle cx="256" cy="256" r="183" fill="{WHITE}"/>
{''.join(wedges)}
<circle cx="256" cy="256" r="82" fill="{WHITE}" stroke="{EDGE}" stroke-width="5"/>
<circle cx="256" cy="256" r="45" fill="{WHITE}" stroke="{ORANGE}" stroke-width="9"/>
<path d="M 256 256 L 256 227 M 256 256 L 278 244" fill="none" stroke="{DARK}" stroke-width="8" stroke-linecap="round"/>
<circle cx="256" cy="256" r="7" fill="{ORANGE}"/>
</svg>
'''
(ROOT / "arshjulet.svg").write_text(svg, encoding="utf-8")


def rgb(value):
    return tuple(bytes.fromhex(value[1:]))


palette = [rgb(color) for color in COLORS]
bg, white, edge, dark, orange = map(rgb, (BG, WHITE, EDGE, DARK, ORANGE))


def segment_distance(x, y, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def pixel(x, y):
    dx, dy = x - 256, y - 256
    radius = hypot(dx, dy)
    if radius > 183:
        return bg
    if radius > 181:
        return white
    if radius >= 87:
        phase = ((atan2(dy, dx) + pi / 2) % (2 * pi)) % (pi / 6)
        if phase < pi / 180 or phase > 29 * pi / 180:
            return white
        return palette[int(((atan2(dy, dx) + pi / 2) % (2 * pi)) / (pi / 6))]
    if radius > 79:
        return edge
    if radius > 50:
        return white
    if radius > 40:
        return orange
    if radius < 7:
        return orange
    if segment_distance(x, y, 256, 256, 256, 227) <= 4 or segment_distance(x, y, 256, 256, 278, 244) <= 4:
        return dark
    return white


def png_chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


rows = bytearray()
for y in range(SIZE):
    rows.append(0)
    for x in range(SIZE):
        samples = [pixel(x + sx, y + sy) for sx in (0.25, 0.75) for sy in (0.25, 0.75)]
        rows.extend(sum(sample[channel] for sample in samples) // 4 for channel in range(3))

png = (
    b"\x89PNG\r\n\x1a\n"
    + png_chunk(b"IHDR", struct.pack(">2I5B", SIZE, SIZE, 8, 2, 0, 0, 0))
    + png_chunk(b"IDAT", zlib.compress(bytes(rows), 9))
    + png_chunk(b"IEND", b"")
)
(ROOT / "icon-512.png").write_bytes(png)
