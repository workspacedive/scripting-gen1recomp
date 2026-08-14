#!/usr/bin/env python3
"""Regression for caught Davidobot/LÖVE alerts versus genuine terminal paths."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "runtime/index.html").read_text()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


# Exact target-device sequence from the 2026-08-13 PotatoVoxel v1.4.4 report.
vertex_error = "Invalid vertex map value: 0"
generic_alert = "An error occurred before the game window could be initialised. Please check the console!"
continued_log = "[PotatoVoxel] actor decal pass aborted"
require(all((vertex_error, generic_alert, continued_log)), "exact caught-exception fixture is incomplete")

report = re.search(
    r"window\.Gen1RecompReportAlert = function \(message\) \{(.*?)\n      \};",
    html,
    re.S,
)
require(report is not None, "alert policy hook is missing")
body = report.group(1)
ready_branch = body.split("} else {", 1)[0]
require("caught_exception_alert_retained" in ready_branch, "caught post-ready alerts are not diagnosed")
require("kind: 'warning'" in ready_branch, "caught post-ready alerts are not retained as warnings")
require("requestPlayerClose" not in ready_branch, "a generic post-ready alert still dismisses a running game")
require("showFatal(message)" in body.split("} else {", 1)[1], "pre-ready alerts no longer show the fatal recovery panel")

alert_hook = re.search(r"window\.alert = function \(message\) \{(.*?)\n      \};", html, re.S)
require(alert_hook is not None and "ready ? 'warning' : 'fatal'" in alert_hook.group(1)
        and "window.Gen1RecompGameLoaded === true" in alert_hook.group(1)
        and "caught_exception_alert" in alert_hook.group(1),
        "browser alert severity is not readiness-aware")

# Generic alerts are ambiguous, but these independent signals are terminal and
# must still return the player to the native dashboard.
require("reason: 'emscripten-abort-after-ready'" in html, "Emscripten abort no longer closes after ready")
require("reason: 'emscripten-exit'" in html, "Emscripten exit no longer closes")
require("reason: 'window-error-after-ready'" in html, "uncaught window errors no longer close after ready")
require("reason: 'unhandled-rejection-after-ready'" in html, "unhandled promise failures no longer close after ready")
require("postNative('runtimeStatus', { kind: 'error'" in html, "terminal errors are not retained natively")

print("Runtime caught-alert policy tests passed")
