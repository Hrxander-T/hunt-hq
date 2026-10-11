#!/usr/bin/env bash
# Builds HuntHQCapture-linux.tar.gz (a single program + config.example.json). Run on Linux (X11).
set -e
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt pyinstaller
# Put the upload token inside the program, so nobody needs a config.json.
TOKEN="${HUNT_INGEST_TOKEN:-$(grep '^ingestToken=' ../android/local.properties 2>/dev/null | cut -d= -f2- | tr -d '[:space:]')}"
if [ -n "$TOKEN" ]; then
  printf 'TOKEN = "%s"\n' "$TOKEN" > hunt_capture/_token.py
else
  echo "WARNING: no token found (HUNT_INGEST_TOKEN or ../android/local.properties). The app will need a config.json."
  rm -f hunt_capture/_token.py
fi
pyinstaller --noconfirm --onefile --name HuntHQCapture \
  --hidden-import pynput.keyboard._xorg --hidden-import pynput.mouse._xorg --hidden-import pystray._xorg \
  --collect-all Xlib run.py
rm -f hunt_capture/_token.py
rm -rf pkg && mkdir pkg
cp dist/HuntHQCapture config.example.json pkg/
tar -czf HuntHQCapture-linux.tar.gz -C pkg .
rm -rf pkg
echo
echo "Done: $(pwd)/HuntHQCapture-linux.tar.gz"
echo "Upload it to the GitHub release 'apps' (keep this exact name)."
