@echo off
rem Use this one if your phone and computer are on different Wi-Fi networks, or the normal start can't connect.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-overt.ps1" -Tunnel
