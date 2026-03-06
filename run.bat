@echo off
setlocal

cd /d "%~dp0"
set PORT=5510

echo Starting arcade at http://localhost:%PORT% ...
start "" http://localhost:%PORT%
python -m http.server %PORT%