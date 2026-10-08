@echo off
setlocal

cd /d "%~dp0"

echo Starting arcade dev server with live reload (prefers http://localhost:5510 and falls forward if busy) ...
node scripts\dev-server.js --open
