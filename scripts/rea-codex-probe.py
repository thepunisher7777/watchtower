"""Verify REA via Codex app-server; never send a model turn or execute target code."""
import argparse
import hashlib
import json
import os
import pathlib
import queue
import subprocess
import tempfile
import threading
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("codex", "target", "output"):
        parser.add_argument(name, type=pathlib.Path)
    parser.add_argument("--call", action="store_true")
    parser.add_argument("--isolated", action="store_true")
    parser.add_argument("--timeout", type=int, default=45)
    args = parser.parse_args()
    if not all(p.is_absolute() for p in (args.codex, args.target, args.output)):
        parser.error("All paths must be absolute")
    if not 1 <= args.timeout <= 180:
        parser.error("Timeout must be between 1 and 180 seconds")
    record = {"discovery_passed": False, "tool_execution": "not_requested",
              "isolated": args.isolated, "model_turns_sent": 0, "methods": []}
    # Reserve exclusively before starting processes. Existing reports survive.
    with args.output.open("x", encoding="utf-8") as report:
        with tempfile.TemporaryDirectory(prefix="arx-codex-probe-") as temp:
            env = os.environ.copy()
            if args.isolated:
                rea = args.codex.parent/"rea"
                if not rea.is_file():
                    raise FileNotFoundError("Isolated mode requires sibling rea executable")
                env["CODEX_HOME"] = temp
                (pathlib.Path(temp)/"config.toml").write_text(
                    '[analytics]\nenabled = false\n[mcp_servers.rea]\ncommand = '
                    + json.dumps(str(rea)) + '\nargs = ["mcp"]\nstartup_timeout_sec = 30\n')
            command = [str(args.codex)]
            if not args.isolated:
                command += ["-c", "mcp_servers.cua_repl.enabled=false"]
            command.append("app-server")
            p = subprocess.Popen(
                command,
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, bufsize=1, env=env,
            )
            messages = queue.Queue()
            stderr_count = [0]

            def reader():
                for line in p.stdout:
                    try:
                        messages.put(json.loads(line))
                    except json.JSONDecodeError:
                        pass
                messages.put(None)

            def drain_stderr():
                # Drain the pipe, without publishing potentially sensitive logs.
                for line in p.stderr:
                    stderr_count[0] += len(line.encode())

            threading.Thread(target=reader, daemon=True).start()
            threading.Thread(target=drain_stderr, daemon=True).start()
            seq = 0

            def send(message):
                p.stdin.write(json.dumps(message) + "\n")
                p.stdin.flush()

            def call(method, params):
                nonlocal seq
                seq += 1
                request_id = seq
                deadline = time.monotonic() + args.timeout
                record["methods"].append(method)
                send({"id": request_id, "method": method, "params": params})
                while True:
                    try:
                        msg = messages.get(timeout=max(0, deadline-time.monotonic()))
                    except queue.Empty as exc:
                        raise TimeoutError(f"Codex timed out during {method}") from exc
                    if msg is None:
                        raise RuntimeError(f"Codex closed stdout during {method}")
                    if msg.get("id") == request_id:
                        if "error" in msg:
                            code = msg["error"].get("code")
                            raise RuntimeError(f"Codex RPC error {code} during {method}")
                        return msg["result"]
                    if "method" in msg and "id" in msg:
                        send({"id": msg["id"], "error": {"code": -32601, "message": "Probe does not authorize interactive requests"}})

            try:
                call("initialize", {
                    "clientInfo": {"name": "arx-rea-verification", "title": "ARX REA verification", "version": "2"},
                    "capabilities": {"experimentalApi": True, "requestAttestation": False},
                })
                send({"method": "initialized", "params": {}})
                inventory = call("mcpServerStatus/list", {"serverName": "rea", "limit": 10})
                server = next(s for s in inventory["data"] if s["name"] == "rea")
                if not server["serverInfo"] or server["toolsError"]:
                    raise RuntimeError("REA discovery returned an error")
                if not {"open_binary", "inspect_artifact"} <= set(server["tools"]):
                    raise RuntimeError("REA does not advertise the required tools")
                record.update(server=server["serverInfo"], tool_count=len(server["tools"]),
                              tool_names=sorted(server["tools"]), discovery_passed=True)
                print("Codex discovered REA", flush=True)
                if args.call:
                    record["tool_execution"] = "pending"
                    thread = call("thread/start", {"ephemeral": True, "cwd": str(args.target.parent)})
                    tid = thread["thread"]["id"]
                    opened = call("mcpServer/tool/call", {"threadId": tid, "server": "rea", "tool": "open_binary", "arguments": {"path": str(args.target)}})
                    if opened.get("isError"):
                        raise RuntimeError("Codex could not open the authorized artifact")
                    inspected = call("mcpServer/tool/call", {"threadId": tid, "server": "rea", "tool": "inspect_artifact", "arguments": {}})
                    evidence = inspected.get("structuredContent") or {}
                    if inspected.get("isError") or not evidence.get("evidence_id"):
                        raise RuntimeError("Codex did not return successful REA evidence")
                    expected = hashlib.sha256(args.target.read_bytes()).hexdigest()
                    if expected != evidence["normalized_result"]["subject"]["root_sha256"]:
                        raise RuntimeError("Codex returned evidence for a different artifact")
                    record.update(tool_execution="passed", evidence_id=evidence["evidence_id"], artifact_sha256=expected)
            except Exception as exc:
                record.update(failure=str(exc), error_type=type(exc).__name__)
                if args.call:
                    record["tool_execution"] = "failed"
            finally:
                p.terminate()
                try:
                    p.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    p.kill()
                    p.wait()
                record["stderr_bytes"] = stderr_count[0]
                record["passed"] = record["discovery_passed"] and (not args.call or record["tool_execution"] == "passed")
                json.dump(record, report, indent=2)
                report.write("\n")
    print("Codex probe:", "PASS" if record["passed"] else "FAIL", str(args.output))
    return 0 if record["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
