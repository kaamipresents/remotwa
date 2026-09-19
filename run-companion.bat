@echo off
title Remotva Audio Remote Companion
echo Starting Remotva Companion on your desktop...
cd /d "%~dp0companion\publish"
start "" "Remotva.Companion.exe" --start-pairing
echo Remotva Companion started in system tray with Pairing window!
timeout /t 3 >nul
