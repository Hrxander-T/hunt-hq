# Hunt HQ Capture (Windows + Linux)

A tray app. Press a hotkey (default **F9**) and the game window is captured and sent to Hunt HQ's Dump queue, through the same pipeline as the Android app (Cloudinary preset `hunt_pending`, then edge function `ingest-shot`).

- Captures the window whose title contains `window_title` (default `proclient`, the PokeMMO window). If there is none, it captures the focused window.
- Failed uploads stay in `~/.hunt-hq-capture/shots` and are retried on the next capture or with tray > **Upload now**.
- Linux: X11 only (Wayland blocks global hotkeys and screen grabs).

## Install

```
cd Automata/hunt-hq/desktop
python3 -m venv .venv
# Linux:   source .venv/bin/activate
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Token

The app needs the same `INGEST_TOKEN` as the Supabase secret. In this order it uses:
1. env var `HUNT_INGEST_TOKEN`
2. `ingest_token` in `config.json` (copy `config.example.json`, not committed)
3. `ingestToken=` in `../android/local.properties` (works on the PC that has the Android project)

## Windows .exe

On the Windows PC: install Python 3.10+ (python.org, tick "Add to PATH"), copy this folder, double-click `build_windows.bat`. It makes `dist\HuntHQCapture.exe`. Put `config.json` (with `ingest_token`) next to the exe and run it. Messages go to `%USERPROFILE%\.hunt-hq-capture\log.txt`.
If the game runs as administrator, run the exe as administrator too, or the hotkey is not seen.

## Run

```
python -m hunt_capture
```

A round icon appears in the tray. Switch to the game and press the hotkey.

## Settings (`config.json`)

| Key | Meaning |
| --- | --- |
| `hotkey` | pynput format, e.g. `<f9>`, `<ctrl>+<alt>+s` |
| `window_title` | part of the game window title, not case sensitive |
| `ingest_token` | see Token |

## Good to know

- Linux: the window's own pixels are read (X11 Composite), so the game can be behind other windows. It cannot be minimized.
- Windows: Windows Graphics Capture reads the window's own picture, so the game can be behind other windows (not minimized). If that fails it falls back to a screen copy.
- Games in Windows exclusive fullscreen, or games that block capture, give black pictures. The app says so and sends nothing. Use borderless/windowed mode.
- Linux tray: some desktops (GNOME) need an AppIndicator extension to show tray icons. The hotkey works without it.
