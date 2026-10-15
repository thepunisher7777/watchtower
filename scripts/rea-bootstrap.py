"""Reconstruct the reviewed REA/Codex tools in a separate workspace prefix.

Preview by default. --apply installs exact versions with npm lifecycle scripts
disabled. --configure-codex additionally uses official scoped setup and backups.
No application dependencies, databases, deployments or scheduled jobs are touched.
"""
import argparse
import copy
import json
import pathlib
import shutil
import subprocess
import sys
import tomllib

PACKAGES = {
    "rea-agents@6.5.0": "https://github.com/morluto/rea",
    "@openai/codex@0.162.1": "https://github.com/openai/codex",
}
REGISTRY = "https://registry.npmjs.org"


def run(command, timeout=180):
    result = subprocess.run(command, text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f"Tool command failed with exit code {result.returncode}; no automatic security changes applied")
    return result.stdout


def unrelated_config(path):
    config = tomllib.loads(path.read_text()) if path.exists() else {}
    config = copy.deepcopy(config)
    config.get("mcp_servers", {}).pop("rea", None)
    # An empty newly created table has no unrelated configuration.
    if config.get("mcp_servers") == {}:
        config.pop("mcp_servers")
    return config


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prefix", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[2]/"arx-tools-runtime")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--configure-codex", action="store_true")
    args = parser.parse_args()
    prefix = args.prefix.absolute()
    if prefix.is_symlink() or prefix in (pathlib.Path('/'), pathlib.Path.home()):
        parser.error("Use a dedicated, non-linked tools prefix")
    plan = {"prefix": str(prefix), "packages": list(PACKAGES),
            "registry": REGISTRY, "ignore_install_scripts": True,
            "configure_only_client": "codex" if args.configure_codex else None,
            "application_changes": False}
    print(json.dumps(plan, indent=2), flush=True)
    if not args.apply:
        print("Preview only. Use --apply for installation.")
        return 0
    npm = shutil.which("npm")
    node = shutil.which("node")
    if not npm or not node:
        raise RuntimeError("Node.js and npm must already be installed")
    v = tuple(int(x) for x in run([node, "--version"]).strip().lstrip('v').split('.'))
    if not ((v[0] == 22 and v >= (22, 19, 0)) or (v[0] == 24 and v >= (24, 11, 0)) or v[0] >= 26):
        raise RuntimeError("Node does not satisfy REA requirements; no automatic upgrade attempted")
    for package, repository in PACKAGES.items():
        metadata = json.loads(run([npm, "view", package, "--json", "--registry="+REGISTRY]))
        observed = metadata.get("repository", {}).get("url", "").removeprefix("git+").removesuffix(".git")
        if observed != repository or not metadata.get("dist", {}).get("integrity"):
            raise RuntimeError("Package provenance check failed")
    run([npm, "install", "--global", "--prefix", str(prefix), *PACKAGES,
         "--ignore-scripts", "--no-audit", "--no-fund", "--registry="+REGISTRY])
    rea = prefix/"bin/rea"
    codex = prefix/"bin/codex"
    if run([str(rea), "--version"]).strip() != "6.5.0":
        raise RuntimeError("Installed REA version mismatch")
    if "0.162.1" not in run([str(codex), "--version"]):
        raise RuntimeError("Installed Codex version mismatch")
    if args.configure_codex:
        config = pathlib.Path(__import__('os').environ.get('CODEX_HOME', str(pathlib.Path.home()/'.codex')))/'config.toml'
        before = unrelated_config(config)
        preview = json.loads(run([str(rea), "setup", "--client", "codex", "--dry-run", "--json"]))
        if preview.get("status") != "planned":
            raise RuntimeError("Official setup could not prepare a safe plan")
        result = json.loads(run([str(rea), "setup", "--client", "codex", "--yes", "--json"]))
        if result.get("status") != "ready" or unrelated_config(config) != before:
            raise RuntimeError("Scoped setup verification failed; inspect official backup before further changes")
    print("Verified REA 6.5.0 and Codex 0.162.1. No services scheduled or started.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Bootstrap failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
