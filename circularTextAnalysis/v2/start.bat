@echo off
rem Lexia launcher for Windows: double-click this file
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python 3 is not installed. Get it from https://www.python.org/downloads/
  pause
  exit /b 1
)
python run.py
pause
