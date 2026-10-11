"""Tray app: press the hotkey, the game window is captured and sent to Hunt HQ's Dump queue."""
import socket
import threading
import time

import pystray
from PIL import Image, ImageDraw
from pynput import keyboard

from . import config, grab, uploader

_busy = threading.Lock()


def log(msg: str) -> None:
    """Also written to ~/.hunt-hq-capture/log.txt, because the packaged app has no console."""
    try:
        config.SHOTS_DIR.parent.mkdir(parents=True, exist_ok=True)
        with open(config.SHOTS_DIR.parent / "log.txt", "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")
    except Exception:
        pass


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


def _single_instance():
    """Only one copy may run: a second copy would fire on every hotkey press too. Returns the socket to keep, or None."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 47653))
        s.listen(1)
    except OSError:
        s.close()
        return None
    return s


def main() -> None:
    lock = _single_instance()  # keep this name alive for the whole run
    if lock is None:
        log("Another Hunt HQ Capture is already running. Closing this copy.")
        print("Another Hunt HQ Capture is already running.", flush=True)
        return
    cfg = config.load()
    config.SHOTS_DIR.mkdir(parents=True, exist_ok=True)
    grab.init()
    icon = pystray.Icon("hunt-hq", _icon_image(), "Hunt HQ Capture")

    def say(msg: str) -> None:
        log(msg)
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
        log("hotkey/menu: capture requested")
        if not _busy.acquire(blocking=False):
            log("capture skipped: still busy with the last one")
            return
        try:
            img = grab.grab(cfg["window_title"])
            log(f"grabbed a picture {img.size}")
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
    log(f"Running. Hotkey {cfg['hotkey']}, window '{cfg['window_title']}', token {'set' if cfg['ingest_token'] else 'MISSING'}.")
    print(f"Running. Hotkey {cfg['hotkey']}, window '{cfg['window_title']}'.", flush=True)
    icon.run()
