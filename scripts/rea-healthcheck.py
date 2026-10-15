"""Read-only REA readiness + real MCP smoke test, with synthetic data only.

Does not install software, alter configuration, call models, or schedule jobs.
Run from any directory. Choose a NEW report path: existing reports are preserved.
"""
import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--rea", default=shutil.which("rea") or str(pathlib.Path.home()/".local/bin/rea"))
    args = parser.parse_args()
    output = args.output.resolve()
    # Exclusive creation prevents accidental replacement of a report or backup.
    with output.open("x", encoding="utf-8") as report_file:
        report = {"checked_at": datetime.now(timezone.utc).isoformat(),
                  "healthy": False, "scope": "remote-runtime-and-synthetic-MCP",
                  "changes_configuration": False, "checks": []}
        current = "executable"

        def run(command, timeout=75):
            result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
            if result.returncode:
                # Avoid copying configuration, inherited environment, or stderr.
                raise RuntimeError(f"command exited {result.returncode}")
            return result.stdout

        try:
            # Preserve the installed CLI alias: REA compares its registration
            # with the invoked launcher. Resolving that symlink for execution
            # can incorrectly report an otherwise aligned registration stale.
            rea = pathlib.Path(args.rea).absolute()
            if not rea.is_file():
                raise FileNotFoundError("REA executable is unavailable")
            root = pathlib.Path(__file__).resolve().parents[1]
            node = shutil.which("node")
            if not node:
                raise FileNotFoundError("Node.js executable is unavailable")
            # Official npm global layout: executable resolves to package/scripts/rea.mjs.
            package = rea.resolve().parent.parent
            manifest = json.loads((package/"package.json").read_text())
            if manifest["name"] != "rea-agents":
                raise RuntimeError("Executable does not resolve to the REA package")
            current = "version"
            version = run([str(rea), "--version"]).strip()
            if version != manifest["version"]:
                raise RuntimeError("CLI/package version mismatch")
            report["version"] = version
            report["checks"].append({"name": current, "passed": True})
            current = "codex-registration-and-workflow"
            doctor = json.loads(run([str(rea), "doctor", "--client", "codex", "--skill", "--json"]))
            if doctor.get("healthy") is not True:
                raise RuntimeError("Scoped doctor is not healthy")
            report["checks"].append({"name": current, "passed": True})
            current = "MCP-transport-and-catalog"
            doctor = json.loads(run([str(rea), "mcp", "doctor", "--json"]))
            if doctor.get("healthy") is not True:
                raise RuntimeError("MCP doctor is not healthy")
            report["tool_count"] = doctor["inventory"]["tools"]["observed"]
            report["checks"].append({"name": current, "passed": True})
            current = "real-synthetic-artifact-analysis"
            with tempfile.TemporaryDirectory(prefix="arx-rea-check-") as temp:
                fixture = pathlib.Path(temp)/"fixture.zip"
                evidence_file = pathlib.Path(temp)/"evidence.json"
                run([sys.executable, str(root/"scripts/rea-create-fixture.py"), str(fixture)])
                run([node, str(root/"scripts/rea-mcp-probe.mjs"), str(package), str(fixture), str(evidence_file)])
                result = json.loads(evidence_file.read_text())
                evidence = result["evidence"]
                expected = hashlib.sha256(fixture.read_bytes()).hexdigest()
                if evidence["normalized_result"]["subject"]["root_sha256"] != expected:
                    raise RuntimeError("Evidence refers to a different artifact")
                report["artifact_sha256"] = expected
                report["evidence_id"] = evidence["evidence_id"]
            report["checks"].append({"name": current, "passed": True})
            report["healthy"] = True
        except Exception as exc:
            report["checks"].append({"name": current, "passed": False, "error_type": type(exc).__name__})
        json.dump(report, report_file, indent=2)
        report_file.write("\n")
    print("REA healthcheck:", "PASS" if report["healthy"] else "FAIL", str(output))
    return 0 if report["healthy"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
