import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(b"<h1>Hello from Python!</h1>")

port = int(os.environ.get("PORT", 3000))
print(f"Server running on port {port}")
HTTPServer(("", port), Handler).serve_forever()
