@echo off
rem Signs this PC in to your Expo account (needed for the tunnel start).
cd /d "%~dp0"
echo.
echo   Sign in to Expo
echo   ---------------
echo   Type your Expo username (or email) and password when asked.
echo   Your password will not show as you type - that is normal.
echo.
call npx expo login
echo.
call npx expo whoami
echo.
pause
