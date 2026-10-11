#!/usr/bin/env bash
# Builds HuntHQCapture-linux.tar.gz (a single program + config.example.json). Run on Linux (X11).
set -e
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt pyinstaller
pyinstaller --noconfirm --onefile --name HuntHQCapture \
  --hidden-import pynput.keyboard._xorg --hidden-import pynput.mouse._xorg --hidden-import pystray._xorg \
  --collect-all Xlib run.py
rm -rf pkg && mkdir pkg
cp dist/HuntHQCapture config.example.json pkg/
tar -czf HuntHQCapture-linux.tar.gz -C pkg .
rm -rf pkg
echo
echo "Done: $(pwd)/HuntHQCapture-linux.tar.gz"
echo "Upload it to Supabase Storage > apps (keep this exact name)."
