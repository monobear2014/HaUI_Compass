"""Verify bundled public originals; optionally restore missing files by pinned hash."""

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1] / "data"
ALLOWED_HOSTS = {"ocw.mit.edu", "raw.githubusercontent.com"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--restore-missing", action="store_true")
    args = parser.parse_args()
    documents = json.loads((ROOT / "manifest.json").read_text())["documents"]
    count = 0
    for entry in documents:
        if entry["source_kind"] != "open_educational":
            continue
        path = ROOT / entry["path"]
        if not path.resolve().is_relative_to(ROOT.resolve()) or path.is_symlink():
            raise SystemExit("Invalid corpus path")
        if not path.exists() and args.restore_missing:
            source = urlparse(entry["source_url"])
            if source.scheme != "https" or source.hostname not in ALLOWED_HOSTS:
                raise SystemExit("Untrusted publisher")
            with urlopen(entry["source_url"], timeout=60) as response:
                target = urlparse(response.url)
                if target.scheme != "https" or target.hostname not in ALLOWED_HOSTS:
                    raise SystemExit("Untrusted redirect")
                content = response.read(5 * 1024 * 1024 + 1)
            if len(content) != entry["bytes"] or hashlib.sha256(content).hexdigest() != entry["sha256"]:
                raise SystemExit("Publisher content changed; review a new version, do not reseal")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        if not path.exists():
            raise SystemExit("Missing original; rerun with --restore-missing")
        content = path.read_bytes()
        if len(content) != entry["bytes"] or hashlib.sha256(content).hexdigest() != entry["sha256"]:
            raise SystemExit("Original does not match manifest")
        count += 1
    print(json.dumps({"result": "PASS", "verified_originals": count}))


if __name__ == "__main__":
    main()
