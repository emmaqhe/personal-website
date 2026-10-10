@echo off
rem Double-click on Windows to open the studio. Close this window to stop.
cd /d "%~dp0"
set PORT=8642
echo Studio running at http://localhost:%PORT%/editor.html
echo Close this window to stop.
start "" "http://localhost:%PORT%/editor.html"
where py >nul 2>nul && (py -3 -m http.server %PORT% --bind 127.0.0.1) || (python -m http.server %PORT% --bind 127.0.0.1)
pause
