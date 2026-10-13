@echo off
rem NASA Eyes ZH - One-click GitHub Push
cd /d "%~dp0"
echo ========================================================
echo   Pushing code to https://github.com/Selflove9417/eyes-solar-system
echo ========================================================
echo.
echo If a GitHub login window pops up, please click 'Sign in with your browser'.
echo.
git push -u origin main
echo.
if errorlevel 1 (
    echo [ERROR] Push failed. Please check the message above.
) else (
    echo [SUCCESS] Code successfully pushed to GitHub!
)
echo.
pause
