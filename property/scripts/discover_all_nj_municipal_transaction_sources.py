#!/usr/bin/env python3
"""Run municipal transaction-source discovery against NJ's full 564-municipality roster.

NJGIN's current government-boundary service can return fewer than 564 records, so
this wrapper uses NJ.gov's tab-delimited localnames.txt as the canonical roster.
The second column is the municipality; deduping it must produce exactly 564 names.
The existing discovery crawler remains responsible for official-site/provider discovery.
"""
from __future__ import annotations

import importlib.util
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
DISCOVERY_PATH = ROOT / "property/scripts/discover_municipal_transaction_sources.py"
LOCALNAMES = "https://www.nj.gov/infobank/localnames.txt"
UA = "Watchdog-municipal-source-discovery/2.1 (+https://www.watchdogindex.com/)"


def load_discovery():
    spec = importlib.util.spec_from_file_location("watchdog_municipal_discovery", DISCOVERY_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load municipal discovery module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def canonical_municipalities() -> list[str]:
    req = urllib.request.Request(LOCALNAMES, headers={"User-Agent": UA, "Accept": "text/plain,*/*;q=0.5"})
    with urllib.request.urlopen(req, timeout=30) as response:
        if int(response.status) != 200:
            raise RuntimeError(f"NJ localnames roster returned HTTP {response.status}")
        text = response.read(5_000_000).decode("utf-8", errors="replace")

    names: set[str] = set()
    for raw in text.splitlines():
        cols = raw.rstrip("\r\n").split("\t")
        if len(cols) < 3:
            continue
        municipality = cols[1].strip()
        if municipality:
            names.add(municipality)

    ordered = sorted(names, key=str.lower)
    if len(ordered) != 564:
        raise RuntimeError(f"Expected 564 NJ municipalities from localnames.txt; found {len(ordered)}")
    return ordered


def main() -> int:
    module = load_discovery()
    module.MUNICIPAL_LAYER = LOCALNAMES
    module.canonical_municipalities = canonical_municipalities
    return int(module.main())


if __name__ == "__main__":
    raise SystemExit(main())
