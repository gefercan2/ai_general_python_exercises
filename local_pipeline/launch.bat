@echo off
echo Starting Unified Local AI System...
echo.
echo Open your browser to: http://localhost:8888
echo Press Ctrl+C to stop
echo.

cd /d "%~dp0"
call venv\Scripts\activate
python -m streamlit run app.py --server.port=8888

pause
