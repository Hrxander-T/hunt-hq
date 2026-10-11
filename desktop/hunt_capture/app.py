"""Tray app: press the hotkey, the game window is captured and sent to Hunt HQ's Dump queue."""
import threading
import time

import pystray
from PIL import Image, ImageDraw
from pynput import keyboard

from . import config, grab, uploader

_busy = threading.Lock()


def _icon_image() -> Image.Image:
    """A pokeball."""
    s = 256  # drawn big, then scaled down so the edges are smooth
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    box = (8, 8, s - 8, s - 8)
    d.pieslice(box, 180, 360, fill=(229, 57, 53, 255))
    d.pieslice(box, 0, 180, fill=(255, 255, 255, 255))
    d.rectangle((8, s // 2 - 14, s - 8, s // 2 + 14), fill=(32, 33, 36, 255))
    d.ellipse(box, outline=(32, 33, 36, 255), width=12)
    d.ellipse((s // 2 - 40, s // 2 - 40, s // 2 + 40, s // 2 + 40), fill=(32, 33, 36, 255))
    d.ellipse((s // 2 - 24, s // 2 - 24, s // 2 + 24, s // 2 + 24), fill=(255, 255, 255, 255))
    return img.resize((64, 64), Image.LANCZOS)


def main() -> None:
    cfg = config.load()
    config.SHOTS_DIR.mkdir(parents=True, exist_ok=True)
    grab.init()
    icon = pystray.Icon("hunt-hq", _icon_image(), "Hunt HQ Capture")

    def say(msg: str) -> None:
        print(msg, flush=True)
        try:
            icon.notify(msg, "Hunt HQ")
        except Exception:
            pass

    def do_upload() -> None:
        sent, failed, err = uploader.upload_all(config.SHOTS_DIR, cfg["ingest_token"])
        if failed:
            say(f"Saved, not sent yet ({failed}): {err}")
        elif sent:
            say(f"Sent {sent} to Hunt HQ")

    def capture() -> None:
        if not _busy.acquire(blocking=False):
            return
        try:
            img = grab.grab(cfg["window_title"])
            img.save(config.SHOTS_DIR / f"shot-{int(time.time() * 1000)}.png")
            do_upload()
        except grab.GrabError as e:
            say(str(e))
        except Exception as e:
            say(f"Capture failed: {e}")
        finally:
            _busy.release()

    def upload_now() -> None:
        if _busy.acquire(blocking=False):
            try:
                do_upload()
            finally:
                _busy.release()

    def run_bg(fn):
        return lambda *_: threading.Thread(target=fn, daemon=True).start()

    hotkeys = keyboard.GlobalHotKeys({cfg["hotkey"]: run_bg(capture)})
    hotkeys.start()

    icon.menu = pystray.Menu(
        pystray.MenuItem(f"Capture ({cfg['hotkey']})", run_bg(capture), default=True),
        pystray.MenuItem("Upload now", run_bg(upload_now)),
        pystray.MenuItem("Quit", lambda *_: (hotkeys.stop(), icon.stop())),
    )
    if not cfg["ingest_token"]:
        print("WARNING: no ingest token. See README.", flush=True)
    print(f"Running. Hotkey {cfg['hotkey']}, window '{cfg['window_title']}'.", flush=True)
    icon.run()
