#!/usr/bin/env python3
"""Static contracts for bridge batching and unchanged-save suppression."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "runtime/index.html").read_text()
player = (ROOT / "modules/player.ts").read_text()
diagnostics = (ROOT / "modules/diagnostics.ts").read_text()
mods = (ROOT / "modules/mods.ts").read_text()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


flush = re.search(r"function flushDiagnosticQueue\(\) \{(.*?)\n      \}", html, re.S)
require(flush is not None, "Web diagnostic batch flusher is missing")
require("diagnosticQueue.splice" in flush.group(1)
        and "postMessage({ schema: 1, entries: entries })" in flush.group(1)
        and "diagnosticPostChain" in flush.group(1),
        "Web diagnostics are not posted as one ordered structured batch")
require("maximumBatchEntries = 48" in html and "setTimeout(flushDiagnosticQueue, 40)" in html,
        "Web diagnostic batching has no bounded count/time flush")
require("queueDiagnostic(payload, level === 'fatal')" in html,
        "fatal Web diagnostics do not force a batch handoff")
require("acceptWebDiagnosticEnvelope" in player
        and "MAX_WEB_BATCH_ENTRIES = 128" in diagnostics,
        "native bridge does not validate bounded diagnostic envelopes")
require("await FileManager.appendText(DIAGNOSTIC_LOG_FILE, text)" in diagnostics
        and "DIAGNOSTIC_BATCH_CHARACTERS = 64 * 1024" in diagnostics
        and "await flushDiagnostics()" in diagnostics,
        "native diagnostics are not ordered asynchronous batches with durability boundaries")

snapshot = re.search(r"function snapshotWithoutSync\(\) \{(.*?)\n      \}", html, re.S)
require(snapshot is not None, "periodic save snapshot function is missing")
require("lastSnapshotInventory === inventory" in snapshot.group(1)
        and "snapshot_skipped_unchanged" in snapshot.group(1)
        and "collectSaveFiles(paths)" in snapshot.group(1),
        "unchanged periodic saves are still Base64-encoded and bridged")
sync = re.search(r"function syncAndSnapshot\(\) \{(.*?)\n      \}", html, re.S)
require(sync is not None and "Module.FS.syncfs(false" in sync.group(1)
        and "collectSaveFiles(paths)" in sync.group(1),
        "final save path no longer forces a complete post-sync snapshot")

package = mods.split("export async function modPackageFiles", 1)[1]
require("const activeMods = library.mods.filter(mod => mod.enabled)" in package
        and "for (const mod of activeMods)" in package,
        "disabled mod payloads are still selected for launch")
require("nativeStateObject(library)" in package,
        "enabled-only payload selection dropped the complete native enablement mirror")

print("Runtime bridge/save/mod performance guard tests passed")
