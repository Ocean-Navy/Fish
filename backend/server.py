from __future__ import annotations

import json
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict

from ocean_supply import collect_summary

ROOT = Path(__file__).resolve().parents[1]
SUBMISSIONS_DIR = ROOT / "data" / "submissions"
SUBMISSIONS_DIR.mkdir(parents=True, exist_ok=True)


def read_json_body(handler: BaseHTTPRequestHandler) -> Dict[str, Any]:
    length = int(handler.headers.get("Content-Length", "0") or "0")
    if length <= 0:
        return {}
    raw = handler.rfile.read(length).decode("utf-8", errors="replace")
    try:
        return json.loads(raw)
    except Exception:
        return {"_raw": raw}


def write_json(handler: BaseHTTPRequestHandler, data: Any, status: int = 200) -> None:
    payload = json.dumps(data, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


class FishHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        write_json(self, {"ok": True})

    def do_GET(self) -> None:
        if self.path == "/api/health":
            write_json(self, {"ok": True, "service": "fish-dashboard", "timestamp": __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime())})
            return
        if self.path == "/api/ocean/summary":
            write_json(self, collect_summary())
            return
        if self.path == "/api/ocean/providers":
            summary = collect_summary()
            write_json(self, {"dataState": summary.get("dataState"), "providers": summary.get("providers", [])})
            return
        if self.path == "/api/ocean/resources":
            # V0 prototype: summary-level data only. Production should return normalized rows.
            summary = collect_summary()
            write_json(self, {"dataState": summary.get("dataState"), "resources": [], "message": "Prototype endpoint. Implement normalized resources in production."})
            return
        if self.path == "/api/usage/summary":
            write_json(self, {
                "dataState": "sample",
                "requests": 0,
                "oceanNativeJobs": 0,
                "providerPayoutUsd": 0,
                "creditsSpent": 0,
                "message": "Usage metrics start after the Fish API prototype is live."
            })
            return
        write_json(self, {"error": "not_found", "path": self.path}, 404)

    def do_POST(self) -> None:
        if self.path == "/api/ocean/refresh":
            write_json(self, collect_summary())
            return
        if self.path in ("/api/waitlist", "/api/providers/apply"):
            body = read_json_body(self)
            submission_id = str(uuid.uuid4())
            filename = "provider" if self.path.endswith("apply") else "waitlist"
            path = SUBMISSIONS_DIR / f"{filename}-{submission_id}.json"
            path.write_text(json.dumps({"id": submission_id, "path": self.path, "body": body}, indent=2))
            write_json(self, {"ok": True, "id": submission_id})
            return
        write_json(self, {"error": "not_found", "path": self.path}, 404)


def run() -> None:
    host = "127.0.0.1"
    port = 8787
    print(f"Fish dashboard backend running at http://{host}:{port}")
    HTTPServer((host, port), FishHandler).serve_forever()


if __name__ == "__main__":
    run()
