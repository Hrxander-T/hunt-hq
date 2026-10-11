"""Makes the pokeball icons: web app (icon-192/512.png) and Windows exe (pokeball.ico). Run: python make_icons.py"""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public"


def ball(size: int, margin: float = 0.03) -> Image.Image:
    s = 1024  # draw big, scale down for smooth edges
    m = int(s * margin)
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    box = (m, m, s - m, s - m)
    c = s // 2
    r = c - m
    d.pieslice(box, 180, 360, fill=(229, 57, 53, 255))
    d.pieslice(box, 0, 180, fill=(255, 255, 255, 255))
    d.rectangle((m, c - r // 9, s - m, c + r // 9), fill=(32, 33, 36, 255))
    d.ellipse(box, outline=(32, 33, 36, 255), width=r // 14)
    d.ellipse((c - r // 3, c - r // 3, c + r // 3, c + r // 3), fill=(32, 33, 36, 255))
    d.ellipse((c - r // 5, c - r // 5, c + r // 5, c + r // 5), fill=(255, 255, 255, 255))
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    for n in (192, 512):
        ball(n, 0.1).save(PUBLIC / f"icon-{n}.png")  # extra margin so round/maskable icons do not cut the ball
    ball(256).save(HERE / "pokeball.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("done")
