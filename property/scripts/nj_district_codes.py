"""Translate NJ state county/municipal codes to MOD-IV (PAMS PIN) district codes.

Division of Taxation Abstract / Table of Aggregates, NJ DCA (UFB, tax summaries,
PILOT, affordable housing, development trends) and DLGS spreadsheets number
municipalities with the state county/municipal code. Watchdog keys every
municipal dataset by the MOD-IV district code, the first four characters of a
PAMS PIN. The two differ for 99 municipalities, so every builder that reads a
state code must pass it through ``pams_from_state`` before using it as a key.

The mapping lives in property/data/nj-district-crosswalk.json.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

CROSSWALK = Path(__file__).resolve().parents[2] / "property/data/nj-district-crosswalk.json"


@lru_cache(maxsize=1)
def _state_to_pams() -> dict[str, str]:
    rows = json.loads(CROSSWALK.read_text())["districts"]
    return {row["dca_code"]: code for code, row in rows.items()}


def pams_from_state(code: object) -> str:
    """Return the PAMS district code for a state/DCA municipal code, or raise KeyError."""
    key = str(code or "").strip()
    if key.endswith(".0"):
        key = key[:-2]
    key = key.zfill(4)
    try:
        return _state_to_pams()[key]
    except KeyError:
        raise KeyError(f"State municipal code {key!r} is not in the NJ district crosswalk") from None


def pams_from_state_or_none(code: object) -> str | None:
    try:
        return pams_from_state(code)
    except KeyError:
        return None
