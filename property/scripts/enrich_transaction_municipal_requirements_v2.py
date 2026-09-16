#!/usr/bin/env python3
"""Compatibility launcher for the stable statewide municipal requirement extractor."""
from __future__ import annotations
import pathlib, runpy
ROOT=pathlib.Path(__file__).resolve().parents[2]
runpy.run_path(str(ROOT / "property/scripts/enrich_transaction_municipal_requirements_v3.py"), run_name="__main__")
