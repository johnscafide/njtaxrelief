#!/usr/bin/env python3
"""Parallel runner for the governed municipal requirements extractor."""
from __future__ import annotations

import argparse
import concurrent.futures
import importlib.util
import json
import pathlib
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[2]
IMPL = ROOT / "property/scripts/extract_transaction_municipal_requirements.py"


def load_impl():
    spec = importlib.util.spec_from_file_location("watchdog_municipal_requirements", IMPL)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load requirements extractor")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--municipal", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=14)
    args = ap.parse_args()
    mod = load_impl()
    with open(args.municipal, encoding="utf-8") as f:
        doc = json.load(f)
    rows = doc.get("results") or []
    codes = {str(r.get("municipality_code") or "") for r in rows}
    if len(codes) != 564:
        raise SystemExit(f"Expected 564 municipality codes, got {len(codes)}")
    generated = mod.now()
    ordinance_map = mod.ordinance_links()
    tasks = [(row, family) for row in rows for family in ("resale_cco", "smoke_fire_cert")]

    def build(task):
        row, family = task
        return mod.build_row(row, family, ordinance_map, generated)

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(2, min(args.workers, 20))) as pool:
        out = list(pool.map(build, tasks))
    if len(out) != 1128:
        raise SystemExit(f"Expected 1128 requirement rows, got {len(out)}")
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"generated_at": generated, "municipalities": len(codes), "rows": out}, f, indent=2, ensure_ascii=False)
    counts = defaultdict(int)
    for row in out:
        counts[(row["requirement_key"], row["requirement_state"])] += 1
    print(json.dumps({"municipalities": len(codes), "rows": len(out), "states": {f"{k[0]}:{k[1]}": v for k,v in counts.items()}}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
