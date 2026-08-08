#!/usr/bin/env python3
"""Run Watchdog Data Factory validation as one review-safe command."""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys


ROOT = pathlib.Path(__file__).resolve().parents[2]
MODIV = ROOT / "property/scripts/data_factory_modiv.py"
NJGIN = ROOT / "property/scripts/data_factory_njgin.py"


def run(command: list[str]) -> dict:
    completed = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
    if completed.returncode:
        raise RuntimeError((completed.stderr or completed.stdout).strip())
    return json.loads(completed.stdout)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--modiv-zip", required=True, help="Official statewide MOD-IV ZIP")
    parser.add_argument("--emit-normalized", action="store_true")
    parser.add_argument("--skip-njgin", action="store_true")
    args = parser.parse_args()
    try:
        modiv_command = [sys.executable, str(MODIV), args.modiv_zip]
        if args.emit_normalized:
            modiv_command.append("--emit-normalized")
        modiv = run(modiv_command)
        njgin = {"ok": None, "skipped": True}
        if not args.skip_njgin:
            njgin = run([sys.executable, str(NJGIN), "--health", "--write-status"])
        result = {
            "ok": bool(modiv.get("validation_passed")) and (njgin.get("ok") is True or njgin.get("skipped") is True),
            "modiv": modiv,
            "njgin": njgin,
            "publish_state": "review_required",
            "note": "A successful factory run validates inputs; it never auto-publishes customer-facing data."
        }
        print(json.dumps(result, indent=2))
        return 0 if result["ok"] else 1
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

