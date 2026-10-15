"""Verify REA through Codex app-server without making a model request.

Usage: python scripts/rea-codex-probe.py ABS_CODEX ABS_ZIP ABS_OUTPUT [--call]
Uses the existing REA registration; never executes the supplied artifact.
"""
import json
import pathlib
import queue
import subprocess
import sys
import threading
import time

codex, target, output = sys.argv[1:4]
execute = "--call" in sys.argv[4:]
if not all(pathlib.Path(p).is_absolute() for p in (codex, target, output)):
    raise ValueError("All paths must be absolute")
p = subprocess.Popen(
    [codex, "-c", "mcp_servers.cua_repl.enabled=false", "app-server"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    text=True, bufsize=1,
)
messages = queue.Queue()

def read_messages():
    for line in p.stdout:
        try:
            messages.put(json.loads(line))
        except json.JSONDecodeError:
            pass

threading.Thread(target=read_messages, daemon=True).start()
seq = 0

def send(message):
    p.stdin.write(json.dumps(message) + "\n")
    p.stdin.flush()

def call(method, params):
    global seq
    seq += 1
    request_id = seq
    deadline = time.monotonic() + 45
    send({"id": request_id, "method": method, "params": params})
    while True:
        try:
            msg = messages.get(timeout=max(0, deadline-time.monotonic()))
        except queue.Empty as exc:
            raise TimeoutError(f"Codex timed out during {method}") from exc
        if msg.get("id") == request_id:
            if "error" in msg:
                raise RuntimeError(json.dumps(msg["error"]))
            return msg["result"]
        # Never auto-approve server requests or perform account/login actions.
        if "method" in msg and "id" in msg:
            send({"id": msg["id"], "error": {"code": -32601, "message": "Probe does not authorize interactive requests"}})

try:
    init = call("initialize", {
        "clientInfo": {"name": "arx-rea-verification", "title": "ARX REA verification", "version": "1"},
        "capabilities": {"experimentalApi": True, "requestAttestation": False},
    })
    send({"method": "initialized"})
    inventory = call("mcpServerStatus/list", {"serverName": "rea", "limit": 10})
    server = next(s for s in inventory["data"] if s["name"] == "rea")
    assert server["serverInfo"]["name"] == "rea" and not server["toolsError"]
    assert "open_binary" in server["tools"] and "inspect_artifact" in server["tools"]
    record = {"server": server["serverInfo"], "tool_count": len(server["tools"]),
              "tool_names": sorted(server["tools"]), "discovery_passed": True,
              "tool_execution": "pending" if execute else "not_requested"}
    pathlib.Path(output).write_text(json.dumps(record, indent=2) + "\n")
    print("Codex server inventory saved", flush=True)
    if execute:
        try:
            thread = call("thread/start", {"ephemeral": True, "cwd": str(pathlib.Path(target).parent)})
            thread_id = thread["thread"]["id"]
            print("Ephemeral Codex thread started", flush=True)
            opened = call("mcpServer/tool/call", {"threadId": thread_id, "server": "rea", "tool": "open_binary", "arguments": {"path": target}})
            inspected = call("mcpServer/tool/call", {"threadId": thread_id, "server": "rea", "tool": "inspect_artifact", "arguments": {}})
            record.update(tool_execution="returned_unvalidated", opened=opened, inspected=inspected)
        except Exception as exc:
            record.update(tool_execution="failed", failure=str(exc))
            raise
        finally:
            pathlib.Path(output).write_text(json.dumps(record, indent=2) + "\n")
finally:
    p.terminate()
    try:
        p.wait(timeout=5)
    except subprocess.TimeoutExpired:
        p.kill()
        p.wait()
