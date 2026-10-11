"""Same pipeline as the Android app: Cloudinary (unsigned preset) first, then the ingest-shot edge function.
A picture is deleted from this PC only after both steps worked; otherwise it stays and is retried."""
import json
import threading
from pathlib import Path

import requests

CLOUD = "njyhj0df"
PRESET = "hunt_pending"
INGEST_URL = "https://mhijdykuzrpekizmrpck.supabase.co/functions/v1/ingest-shot"

_lock = threading.Lock()


def _to_cloudinary(f: Path) -> dict:
    with f.open("rb") as fh:
        r = requests.post(
            f"https://api.cloudinary.com/v1_1/{CLOUD}/image/upload",
            data={"upload_preset": PRESET},
            files={"file": (f.name, fh, "image/png")},
            timeout=(15, 60),
        )
    if not r.ok:
        raise RuntimeError(f"Cloudinary {r.status_code}: {r.text[:120]}")
    return r.json()


def _to_supabase(public_id: str, url: str, token: str) -> None:
    r = requests.post(
        INGEST_URL,
        json={"public_id": public_id, "url": url},
        headers={"x-ingest-token": token},
        timeout=(15, 30),
    )
    if r.status_code == 401:
        raise RuntimeError("Wrong upload token")
    if not r.ok:
        raise RuntimeError(f"Server {r.status_code}: {r.text[:120]}")


def upload_all(shots_dir: Path, token: str) -> tuple[int, int, str | None]:
    """Returns (sent, failed, last_error)."""
    files = sorted(shots_dir.glob("*.png"))
    if not token:
        return 0, len(files), "No ingest token (see README)"
    sent = failed = 0
    error = None
    with _lock:
        for f in files:
            side = Path(str(f) + ".json")
            try:
                # The Cloudinary answer is remembered next to the file, so a retry never uploads twice.
                if side.exists():
                    cloud = json.loads(side.read_text(encoding="utf-8"))
                else:
                    cloud = _to_cloudinary(f)
                    side.write_text(json.dumps(cloud), encoding="utf-8")
                _to_supabase(cloud["public_id"], cloud["secure_url"], token)
                f.unlink()
                side.unlink(missing_ok=True)
                sent += 1
            except Exception as e:  # keep going with the next file
                failed += 1
                error = str(e) or type(e).__name__
    return sent, failed, error
