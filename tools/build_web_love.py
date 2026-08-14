#!/usr/bin/env python3
"""Rebuild the executable compatibility layer from an immutable official core.

This tool intentionally does not create a reconstructed/patched Gen1Recomp
archive. It invokes the same pure TypeScript layer builder used by on-device
component installation, then verifies the official-core and output digests.

Usage:
  python3 tools/build_web_love.py /path/to/gen1recomp-0.1.78.love
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK = json.loads((ROOT / "config" / "compatibility-pack.json").read_text())
OUTPUT = ROOT / "runtime" / PACK["executionLayer"]["file"]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: build_web_love.py /path/to/gen1recomp-0.1.78.love")
    source = Path(sys.argv[1]).expanduser().resolve()
    expected_core = PACK["upstreamCore"]["sha256"]
    if not source.is_file() or digest(source) != expected_core:
        raise SystemExit("Refusing to build: input is not the manifest-pinned immutable upstream core.")

    command = [
        "npx", "--yes", "tsx@4.20.3", "tools/test_execution_layer.mjs",
        str(source), str(OUTPUT),
    ]
    subprocess.run(command, cwd=ROOT, check=True)
    actual = digest(OUTPUT)
    expected = PACK["executionLayer"]["sha256"]
    if actual != expected:
        OUTPUT.unlink(missing_ok=True)
        raise SystemExit(f"Execution-layer digest mismatch: expected {expected}, received {actual}")
    if digest(source) != expected_core:
        raise SystemExit("Immutable upstream core changed during layer generation.")
    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size} bytes)")
    print(f"SHA-256 {actual}")
    print(f"Immutable core retained: {expected_core}")


if __name__ == "__main__":
    main()
