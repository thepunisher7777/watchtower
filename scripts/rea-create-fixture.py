"""Create a synthetic, authorized archive. No target code is executed."""
import json
import pathlib
import sys
import zipfile

target = pathlib.Path(sys.argv[1]).resolve()
if target.exists():
    raise FileExistsError("Choose a new output path")
with zipfile.ZipFile(target, "x", compression=zipfile.ZIP_STORED) as archive:
    for name, content in {
        "manifest.json": json.dumps({"name": "arx-rea-safe-fixture", "version": "1.0.0", "synthetic": True}),
        "example.js": "export function add(a, b) { return a + b; }\n",
        "README.txt": "Synthetic ARX fixture. Static inspection only. No personal data.\n",
    }.items():
        entry = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        entry.external_attr = 0o100644 << 16
        archive.writestr(entry, content)
print(target)
