#!/usr/bin/env python3
"""Build a hash-declared local LÖVE Web runtime bundle for manual import.

This tool never downloads or licenses a runtime. Supply a reviewed compatibility/no-pthreads
love.js and its matching love.wasm, plus their exact source commit.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

MAX_BYTES = 32 * 1024 * 1024
FIXED_TIME = (2026, 1, 1, 0, 0, 0)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def entry(name: str) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, FIXED_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    info.create_system = 3
    return info


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--js", type=Path, required=True, help="reviewed compatibility love.js")
    parser.add_argument("--wasm", type=Path, required=True, help="matching love.wasm")
    parser.add_argument("--version", required=True, help="bundle version, e.g. 11.5-custom.1")
    parser.add_argument("--commit", required=True, help="exact 40-hex source commit")
    parser.add_argument("--output", type=Path, required=True, help="output .zip")
    parser.add_argument("--license", type=Path, help="optional license/notices text")
    args = parser.parse_args()

    if not re.fullmatch(r"[A-Za-z0-9._+-]{1,64}", args.version):
        raise SystemExit("Invalid --version; use 1–64 letters, numbers, dot, underscore, plus, or hyphen.")
    if not re.fullmatch(r"[a-fA-F0-9]{40}", args.commit):
        raise SystemExit("Invalid --commit; expected exactly 40 hexadecimal characters.")
    js = args.js.read_bytes()
    wasm = args.wasm.read_bytes()
    if not js or not wasm:
        raise SystemExit("Runtime inputs must not be empty.")
    if len(js) + len(wasm) > MAX_BYTES:
        raise SystemExit("Runtime inputs exceed the suite's 32 MiB expanded limit.")
    if wasm[:8] != b"\x00asm\x01\x00\x00\x00":
        raise SystemExit("love.wasm has invalid WebAssembly magic/version bytes.")
    text = js.decode("utf-8")
    if any(marker in text for marker in ("SharedArrayBuffer", "PThread", "pthread-main.js")):
        raise SystemExit("love.js appears threaded and is incompatible with the file-only WKWebView host.")
    if 'Module["FS"]=FS' not in text and 'Module["getMemory"]=getMemory;' not in text:
        raise SystemExit("love.js has no compatible Emscripten filesystem export anchor.")

    manifest = {
        "schema": 1,
        "id": "love-web",
        "version": args.version,
        "commit": args.commit.lower(),
        "files": {"love.js": sha256(js), "love.wasm": sha256(wasm)},
    }
    payloads: list[tuple[str, bytes]] = [
        ("runtime-manifest.json", (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()),
        ("love.js", js),
        ("love.wasm", wasm),
    ]
    if args.license is not None:
        payloads.append(("LICENSE.txt", args.license.read_bytes()))
    if sum(len(data) for _, data in payloads) > MAX_BYTES:
        raise SystemExit("Expanded runtime bundle exceeds 32 MiB.")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, "w", allowZip64=False) as archive:
        for name, data in payloads:
            archive.writestr(entry(name), data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    if args.output.stat().st_size > MAX_BYTES:
        args.output.unlink()
        raise SystemExit("Compressed runtime bundle exceeds 32 MiB.")
    print(f"Wrote {args.output} ({args.output.stat().st_size} bytes)")
    print(json.dumps(manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
