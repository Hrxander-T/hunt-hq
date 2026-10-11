@echo off
rem Builds dist\HuntHQCapture.exe (run this on Windows). Needs Python 3.10+ from python.org.
setlocal
cd /d "%~dp0"
if not exist .venv (py -m venv .venv || goto :err)
call .venv\Scripts\activate.bat
pip install -r requirements.txt pyinstaller || goto :err
pyinstaller --noconfirm --onefile --noconsole --name HuntHQCapture --icon pokeball.ico ^
  --hidden-import pynput.keyboard._win32 --hidden-import pynput.mouse._win32 --hidden-import pystray._win32 ^
  --collect-all windows_capture run.py || goto :err
echo.
echo Done: dist\HuntHQCapture.exe
echo Put a config.json next to it (copy config.example.json, fill in ingest_token).
pause
exit /b 0
:err
echo BUILD FAILED. Copy the lines above and send them to Claude.
pause
exit /b 1
