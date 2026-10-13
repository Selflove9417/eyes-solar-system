@echo off
rem NASA Eyes Chinese portal - one-click local preview.
rem Kept ASCII-only on purpose: cmd.exe parses this file with the console's OEM
rem code page, so Chinese comments here would break it. See README.md for details.
rem
rem Deliberately flat (labels + goto, no nested parenthesised blocks): %VAR% inside
rem a block is expanded once when the block is parsed, which silently breaks loops.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto :nonode

curl.exe -s -o nul --max-time 2 http://127.0.0.1:8890/ 2>nul
if not errorlevel 1 goto :open

echo Starting server on http://127.0.0.1:8890/ ...
start "NASA Eyes ZH server" /min cmd /c "node tools\serve.mjs . 8890"

rem Wait for the port to actually answer; a fixed delay is a race that shows the
rem browser a "connection refused" page.
set /a tries=0
:waitloop
set /a tries+=1
if %tries% gtr 20 goto :timeout
curl.exe -s -o nul --max-time 1 http://127.0.0.1:8890/ 2>nul
if not errorlevel 1 goto :open
ping -n 2 127.0.0.1 >nul
goto waitloop

:open
echo Server ready at http://127.0.0.1:8890/
start "" http://127.0.0.1:8890/
echo.
echo To stop the server, close the "NASA Eyes ZH server" window.
ping -n 6 127.0.0.1 >nul
goto :eof

:timeout
echo [ERROR] Server did not come up within ~20s.
echo         Run "node tools\serve.mjs . 8890" in a terminal to see the real error.
pause
exit /b 1

:nonode
echo [ERROR] Node.js not found in PATH. Install Node 18+ and try again.
pause
exit /b 1
