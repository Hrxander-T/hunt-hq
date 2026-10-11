"""Settings: config.json next to the app. The token can also come from HUNT_INGEST_TOKEN,
or (same PC as the Android project) from ../hunt-hq-android/local.properties."""
import json
import os
import sys
from pathlib import Path

# Next to the .exe when packaged, else the project folder.
ROOT = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent
SHOTS_DIR = Path.home() / ".hunt-hq-capture" / "shots"
DEFAULTS = {"hotkey": "<f9>", "window_title": "proclient", "ingest_token": ""}


def _token_from_android() -> str:
    f = ROOT.parent / "android" / "local.properties"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            if line.startswith("ingestToken="):
                return line.split("=", 1)[1].strip()
    return ""


def load() -> dict:
    cfg = dict(DEFAULTS)
    p = ROOT / "config.json"
    if p.exists():
        cfg.update(json.loads(p.read_text(encoding="utf-8")))
    tok = os.environ.get("HUNT_INGEST_TOKEN") or cfg.get("ingest_token") or _token_from_android()
    cfg["ingest_token"] = (tok or "").strip()
    return cfg
