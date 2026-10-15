"""Real REA JavaScript analysis of an owned, synthetic module; no target execution."""
import argparse
import json
import pathlib
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rea", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    args = parser.parse_args()
    if not args.rea.is_absolute() or not args.output.is_absolute():
        parser.error("Use absolute paths")
    record = {"passed": False, "target": "synthetic-owned-module", "target_executed": False}
    with args.output.open("x", encoding="utf-8") as report:
        try:
            with tempfile.TemporaryDirectory(prefix="arx-rea-js-") as temp:
                root = pathlib.Path(temp)
                (root/"package.json").write_text(json.dumps({"name": "arx-authorized-fixture", "type": "module", "version": "1.0.0"}))
                (root/"index.js").write_text("export function playbackProgress(position, duration) { return duration > 0 ? Math.min(1, position / duration) : null; }\n")
                r = subprocess.run([str(args.rea), "analyze-javascript-application", str(root), "--json"], capture_output=True, text=True, timeout=90)
                evidence = json.loads(r.stdout)
                if r.returncode or evidence.get("error"):
                    record.update(error_code=evidence.get("code"), operation=evidence.get("details", {}).get("operation"))
                    raise RuntimeError("REA JavaScript analysis did not complete")
                if evidence.get("operation") != "analyze_javascript_application" or not evidence.get("evidence_id"):
                    raise RuntimeError("Unexpected evidence returned by REA")
                graph = evidence["normalized_result"]["graph"]
                if not graph.get("nodes"):
                    raise RuntimeError("REA returned no JavaScript graph")
                record.update(passed=True, evidence_id=evidence["evidence_id"], graph_nodes=len(graph["nodes"]), graph_edges=len(graph.get("edges", [])), operation=evidence["operation"])
        except Exception as exc:
            record.update(error_type=type(exc).__name__)
        json.dump(record, report, indent=2)
        report.write("\n")
    print(json.dumps(record))
    return 0 if record["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
