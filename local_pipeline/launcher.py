#!/usr/bin/env python3
"""
Simple launcher for Unified Local AI System
"""

import subprocess
import sys
import os
from pathlib import Path
import platform

PROJECT_DIR = Path(__file__).parent
VENV_DIR = PROJECT_DIR / "venv"
APP_FILE = PROJECT_DIR / "app.py"

def main():
    print("=" * 60)
    print("UNIFIED LOCAL AI SYSTEM - STARTING")
    print("=" * 60)
    
    # Get Python executable
    system = platform.system()
    if system == "Windows":
        python_exe = VENV_DIR / "Scripts" / "python.exe"
    else:
        python_exe = VENV_DIR / "bin" / "python"
    
    if not python_exe.exists():
        print(f"Error: Virtual environment not found at {VENV_DIR}")
        print("Please run: python -m venv venv")
        sys.exit(1)
    
    # Check Ollama
    print("\nChecking Ollama...")
    try:
        result = subprocess.run(["ollama", "list"], capture_output=True, timeout=5)
        if result.returncode == 0:
            print("✓ Ollama is running")
        else:
            print("⚠️  Ollama not running. Start it with: ollama serve")
    except:
        print("⚠️  Ollama not found. Install from https://ollama.ai")
    
    # Run Streamlit
    print(f"\nStarting Streamlit on port 8888...")
    print(f"Open your browser to: http://localhost:8888")
    print("\nPress Ctrl+C to stop\n")
    
    cmd = [
        str(python_exe),
        "-m", "streamlit", "run",
        str(APP_FILE),
        "--server.port=8888",
        "--server.headless=true",
        "--browser.gatherUsageStats=false"
    ]
    
    try:
        subprocess.run(cmd, cwd=str(PROJECT_DIR))
    except KeyboardInterrupt:
        print("\n\nShutting down...")

if __name__ == "__main__":
    main()
