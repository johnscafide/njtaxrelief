#!/usr/bin/env python3
"""Run the governed federal housing builder with collision-safe NJ municipality normalization.

The v0.41 source builder originally stripped every terminal municipality type, which
collapsed distinct same-county municipalities such as Egg Harbor City and Egg Harbor
Township. The source contracts themselves are valid; this runner narrows normalization
to the only case that needs stripping: duplicated terminal types such as
"Atlantic City city" -> "atlantic city". All other municipality type tokens remain
part of the canonical name.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
BUILDER = HERE / "build_federal_housing_context_v041.py"

spec = importlib.util.spec_from_file_location("watchdog_federal_housing_v041", BUILDER)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Unable to load governed builder: {BUILDER}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def collision_safe_locality_base(value):
    normalized = module.clean(value)
    tokens = normalized.split()
    if (
        len(tokens) >= 2
        and tokens[-1] in module.MUNI_TYPES
        and tokens[-2] == tokens[-1]
    ):
        return " ".join(tokens[:-1])
    return normalized


module.locality_base = collision_safe_locality_base

# Positive controls for the normalization contract.
assert collision_safe_locality_base("Atlantic City City") == "atlantic city"
assert collision_safe_locality_base("Egg Harbor City") == "egg harbor city"
assert collision_safe_locality_base("Egg Harbor Township") == "egg harbor township"
assert collision_safe_locality_base("Gloucester City") == "gloucester city"
assert collision_safe_locality_base("Gloucester Township") == "gloucester township"

raise SystemExit(module.main())
