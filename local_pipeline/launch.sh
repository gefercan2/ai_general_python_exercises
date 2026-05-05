#!/bin/bash
# macOS/Linux launcher for Unified Local AI System

echo "========================================"
echo "Unified Local AI System - Starting..."
echo "========================================"
echo

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 not found!"
    echo "Please install Python 3.8 or higher"
    exit 1
fi

# Check if virtual environment exists
if [ ! -f "venv/bin/python" ]; then
    echo "Virtual environment not found. Creating..."
    python3 -m venv venv
    
    echo "Installing dependencies..."
    venv/bin/python -m pip install --upgrade pip
    venv/bin/pip install -r requirements.txt
fi

# Run the launcher
echo
echo "Starting application..."
echo
venv/bin/python launcher.py
