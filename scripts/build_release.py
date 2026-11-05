"""Build the public plugin ZIP without copying local credentials."""

import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
plugin = root / "flibusta"
manifest = json.loads((plugin / "manifest.json").read_text(encoding="utf-8"))
files = ("manifest.json", "device.json", "plugin.js", "README.md")
if set(manifest["files"]) != set(files):
    raise ValueError("Review the release file list before changing the public package")
version = manifest["version"]
if not re.fullmatch(r"\d+\.\d+\.\d+", version):
    raise ValueError("Expected a MAJOR.MINOR.PATCH version")

output = root / "dist" / f"flibusta-crosspoint-{version}.zip"
output.parent.mkdir(exist_ok=True)
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(plugin / name, "flibusta/" + name)
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == {"flibusta/" + name for name in files}
print(output)
