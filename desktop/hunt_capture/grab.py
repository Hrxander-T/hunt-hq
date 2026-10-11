"""Find the game window and take a picture of it. Windows: ctypes. Linux: X11 via python-xlib.
Linux reads the window's own pixels (works when it is behind other windows, needs a compositing desktop).
Windows still copies screen pixels, so the window must be visible there for now."""
import sys
import time

import mss
from PIL import Image


class GrabError(Exception):
    pass


# ---------- Windows ----------p
if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    dwm = ctypes.windll.dwmapi
    user32.GetForegroundWindow.restype = wintypes.HWND
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32.IsIconic.argtypes = [wintypes.HWND]
    user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    dwm.DwmGetWindowAttribute.argtypes = [wintypes.HWND, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD]

    def init() -> None:
        # Real pixels, not scaled ones, so the window rectangle matches the screen grab.
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            user32.SetProcessDPIAware()

    def _title(hwnd) -> str:
        n = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(n + 1)
        user32.GetWindowTextW(hwnd, buf, n + 1)
        return buf.value

    def _rect(hwnd):
        r = wintypes.RECT()
        # DWMWA_EXTENDED_FRAME_BOUNDS = 9 (the visible frame, without the invisible shadow border)
        if dwm.DwmGetWindowAttribute(hwnd, 9, ctypes.byref(r), ctypes.sizeof(r)) != 0:
            user32.GetWindowRect(hwnd, ctypes.byref(r))
        return r.left, r.top, r.right - r.left, r.bottom - r.top

    def _find_hwnd(title: str):
        found = []
        proc_t = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

        def cb(hwnd, _):
            if user32.IsWindowVisible(hwnd) and not user32.IsIconic(hwnd) and title.lower() in _title(hwnd).lower():
                found.append(hwnd)
            return True

        user32.EnumWindows(proc_t(cb), 0)
        return found[0] if found else None

    def window_rect(title: str):
        hwnd = _find_hwnd(title)
        if hwnd:
            return _rect(hwnd)
        hwnd = user32.GetForegroundWindow()
        if hwnd and not user32.IsIconic(hwnd):
            return _rect(hwnd)
        return None

    def _native(title: str):
        """Windows Graphics Capture: the window's own picture, even when it is covered. None if it does not work."""
        import threading
        try:
            import numpy as np
            from windows_capture import WindowsCapture
        except ImportError:
            return None
        hwnd = _find_hwnd(title)
        if not hwnd:
            return None
        name = _title(hwnd)
        got = {}
        done = threading.Event()

        def start(border):
            cap = WindowsCapture(cursor_capture=False, draw_border=border, window_name=name)

            @cap.event
            def on_frame_arrived(frame, control):
                if "img" not in got:
                    # BGRA -> RGB
                    got["img"] = Image.fromarray(np.ascontiguousarray(frame.frame_buffer[:, :, 2::-1]))
                    done.set()
                    control.stop()

            @cap.event
            def on_closed():
                done.set()

            return cap.start_free_threaded()

        try:
            try:
                ctl = start(False)  # no yellow border (needs newer Windows)
            except Exception:
                ctl = start(None)
            done.wait(3)
            try:
                ctl.stop()
            except Exception:
                pass
        except Exception as e:
            print(f"Windows capture failed: {e}", flush=True)
            return None
        if "img" in got:
            print("Method: Windows Graphics Capture (own pixels)", flush=True)
        return got.get("img")

# ---------- Linux (X11) ----------
else:
    from Xlib import X, display

    def init() -> None:
        pass

    def _name(d, w) -> str:
        p = w.get_full_property(d.intern_atom("_NET_WM_NAME"), X.AnyPropertyType)
        if p is not None:
            v = p.value
            return v.decode("utf-8", "replace") if isinstance(v, bytes) else str(v)
        n = w.get_wm_name()
        return n if isinstance(n, str) else ""

    def _find(d, root, title: str):
        """The window whose title contains `title`, else the focused window, else None."""
        lst = root.get_full_property(d.intern_atom("_NET_CLIENT_LIST"), X.AnyPropertyType)
        for wid in (lst.value if lst is not None else []):
            w = d.create_resource_object("window", wid)
            try:
                if w.get_attributes().map_state != X.IsViewable:
                    continue
                if title.lower() in _name(d, w).lower():
                    return w
            except Exception:
                continue
        act = root.get_full_property(d.intern_atom("_NET_ACTIVE_WINDOW"), X.AnyPropertyType)
        if act is not None and len(act.value) and act.value[0]:
            return d.create_resource_object("window", act.value[0])
        return None

    def _native(title: str):
        """Read the window's own pixels (even when covered). None if that does not work."""
        d = display.Display()
        try:
            root = d.screen().root
            w = _find(d, root, title)
            if w is None:
                raise GrabError(f"No window named '{title}' and no focused window")
            g = w.get_geometry()
            if g.width < 50 or g.height < 50:
                return None
            print(f"Window: '{_name(d, w)}' {g.width}x{g.height}", flush=True)
            img = _composite_image(d, w)
            if img is not None:
                print("Method: composite (own pixels)", flush=True)
                return img
            try:
                raw = w.get_image(0, 0, g.width, g.height, X.ZPixmap, 0xFFFFFFFF)
                print("Method: plain window read", flush=True)
                return Image.frombytes("RGB", (g.width, g.height), raw.data, "raw", "BGRX")
            except Exception:
                return None
        finally:
            d.close()

    def _composite_image(d, w):
        """Ask X11 to keep an off-screen copy of the window, then read it (works when covered)."""
        pix = None
        redirected = False
        try:
            from Xlib.ext import composite
            if not d.has_extension("Composite"):
                return None
            d.composite_query_version()
            w.composite_redirect_window(composite.RedirectAutomatic)
            redirected = True
            d.sync()
            time.sleep(0.4)  # let the game draw a frame into the new off-screen copy
            pix = w.composite_name_window_pixmap()
            d.sync()
            pg = pix.get_geometry()
            raw = pix.get_image(0, 0, pg.width, pg.height, X.ZPixmap, 0xFFFFFFFF)
            return Image.frombytes("RGB", (pg.width, pg.height), raw.data, "raw", "BGRX")
        except Exception as e:
            print(f"Composite failed: {e}", flush=True)
            return None
        finally:
            try:
                if pix is not None:
                    pix.free()
                if redirected:
                    w.composite_unredirect_window(composite.RedirectAutomatic)
                d.sync()
            except Exception:
                pass

    def window_rect(title: str):
        d = display.Display()
        try:
            root = d.screen().root
            w = _find(d, root, title)
            if w is None:
                return None
            g = w.get_geometry()
            pos = root.translate_coords(w, 0, 0)  # window origin in screen coordinates
            return pos.x, pos.y, g.width, g.height
        finally:
            d.close()


def _screen_copy(title: str) -> Image.Image:
    rect = window_rect(title)
    if rect is None:
        raise GrabError(f"No window named '{title}' and no focused window")
    x, y, w, h = rect
    with mss.mss() as sct:
        scr = sct.monitors[0]  # all screens together
        left, top = max(x, scr["left"]), max(y, scr["top"])
        right = min(x + w, scr["left"] + scr["width"])
        bottom = min(y + h, scr["top"] + scr["height"])
        if right - left < 50 or bottom - top < 50:
            raise GrabError("Window is off screen or too small")
        shot = sct.grab({"left": left, "top": top, "width": right - left, "height": bottom - top})
        return Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")


def grab(title: str) -> Image.Image:
    img = _native(title) or _screen_copy(title)
    if img.getbbox() is None:
        raise GrabError("Picture is black (the game may block screen capture)")
    return img
