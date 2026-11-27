#!/usr/bin/env python3
"""Preview the site locally:  python3 run.py"""
import os, sys, http.server, socketserver, threading, webbrowser
START_PORT, MAX_TRIES = 8000, 20

def find_free_port(start):
    for port in range(start, start + MAX_TRIES):
        try:
            with socketserver.TCPServer(("", port), None): return port
        except OSError: continue
    return None

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    if not os.path.exists("index.html"):
        print("No index.html here. Run this from your website folder."); sys.exit(1)
    port = find_free_port(START_PORT)
    if port is None:
        print(f"No free port between {START_PORT} and {START_PORT+MAX_TRIES}."); sys.exit(1)
    url = f"http://localhost:{port}"
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
        def end_headers(self):
            # never cache during local preview, so edits always show up on reload
            self.send_header("Cache-Control", "no-store, max-age=0")
            super().end_headers()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), Q) as httpd:
        print(f"\n  Alex Hashemi | local preview\n  {'-'*30}\n  Serving   {url}\n  Folder    {os.getcwd()}\n")
        print("  Opening your browser. Press Ctrl+C to stop.\n")
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
        try: httpd.serve_forever()
        except KeyboardInterrupt: print("\n  Stopped.\n")

if __name__ == "__main__": main()
