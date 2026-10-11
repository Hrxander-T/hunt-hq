"""Entry point for the packaged .exe (a --noconsole exe has no stdout, so messages go to a log file)."""
import sys
from pathlib import Path

if sys.stdout is None or sys.stderr is None:
    d = Path.home() / ".hunt-hq-capture"
    d.mkdir(parents=True, exist_ok=True)
    log = open(d / "log.txt", "a", encoding="utf-8", buffering=1)
    sys.stdout = sys.stdout or log
    sys.stderr = sys.stderr or log

from hunt_capture.app import main

main()
