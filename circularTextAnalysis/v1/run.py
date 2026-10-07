#!/usr/bin/env python3
"""Static server + CORS proxy for local Ollama. Run: python3 run.py"""
import http.server, socketserver, urllib.request, urllib.error
import json, webbrowser, threading, os

PORT = 8000
OLLAMA_URL = "http://localhost:11434"

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200); self.end_headers()

    def do_POST(self):
        if self.path.startswith("/llm/"):
            self.proxy_to_ollama()
        else:
            self.send_error(404)

    def proxy_to_ollama(self):
        target = OLLAMA_URL + self.path[len("/llm"):]
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            req = urllib.request.Request(target, data=body,
                headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.URLError:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": "Could not reach Ollama at localhost:11434. Run: ollama serve"
            }).encode())

def open_browser():
    webbrowser.open(f"http://localhost:{PORT}")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    threading.Timer(1.0, open_browser).start()
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Lexia running at http://localhost:{PORT}")
        httpd.serve_forever()
