#!/usr/bin/env python3
"""Draws the Hunt HQ app icon (a pokeball, like the favicon) as PNG files. No dependencies.
Run from the project root:  python3 scripts/make-icons.py
The ball fills about 72% of the square so it also survives Android's round "maskable" crop."""
import struct, zlib, os

DARK, RED, WHITE = (36, 31, 61), (214, 57, 63), (255, 255, 255)

def cov(d):  # anti-aliased edge: d is the signed distance in pixels (negative = inside)
    return max(0.0, min(1.0, 0.5 - d))

def render(size):
    c, R = size / 2, 0.36 * size            # centre and outer radius of the ball
    w = 0.064 * size                        # outline thickness
    rb = 0.135 * size                       # centre button, outer radius
    rows = []
    for y in range(size):
        row = bytearray([0])                # PNG filter type 0
        for x in range(size):
            px = list(map(float, WHITE))
            def put(col, k):
                for i in range(3):
                    px[i] = px[i] * (1 - k) + col[i] * k
            r = ((x + 0.5 - c) ** 2 + (y + 0.5 - c) ** 2) ** 0.5
            put(DARK, cov(r - R))                                               # outline disk
            put(RED if y + 0.5 < c else WHITE, cov(r - (R - w)))                # top red, bottom white
            put(DARK, cov(abs(y + 0.5 - c) - w / 2) * cov(r - (R - w)))         # band across the middle
            put(DARK, cov(r - rb))                                              # button outline
            put(WHITE, cov(r - (rb - 0.8 * w)))                                 # button centre
            row += bytes(int(round(v)) for v in px)
        rows.append(bytes(row))
    return b"".join(rows)

def png(size):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(render(size), 9)) + chunk(b"IEND", b"")

if __name__ == "__main__":
    os.makedirs("public", exist_ok=True)
    for s in (192, 512):
        with open(f"public/icon-{s}.png", "wb") as f:
            f.write(png(s))
        print(f"public/icon-{s}.png")
