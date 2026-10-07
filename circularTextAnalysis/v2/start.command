#!/bin/bash
# Lexia launcher for macOS / Linux: double-click (Mac) or run ./start.command
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is not installed. Get it from https://www.python.org/downloads/"
  read -p "Press Enter to close"; exit 1
fi
python3 run.py
read -p "Lexia stopped. Press Enter to close"
