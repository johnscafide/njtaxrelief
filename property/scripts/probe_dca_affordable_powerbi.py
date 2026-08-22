#!/usr/bin/env python3
"""Discovery-only wrapper for the governed DCA zoning-directory parser."""
from __future__ import annotations

import json
from pathlib import Path

import requests

from parse_dca_zoning_directory import DEFAULT_SOURCE, build_artifact, fetch_source

SERVICE = "https://services.arcgis.com/Aur8tCo478N3VovT/arcgis/rest/services/Municipal_Zoning/FeatureServer/0"
OUTPUT = Path("property/data/dca-zoning-directory-probe.json")


def main() -> None:
    blob, last_modified = fetch_source(DEFAULT_SOURCE)
    artifact = build_artifact(blob, DEFAULT_SOURCE, last_modified)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(artifact, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("DIRECTORY_SUMMARY", json.dumps({
        "source_sha256": artifact["source_sha256"],
        "source_last_modified": artifact["source_last_modified"],
        "municipality_count": artifact["municipality_count"],
        "completeness": artifact["completeness"],
        "output": str(OUTPUT),
    }, sort_keys=True))
    for code in ("0101", "0102", "0808", "1102"):
        print("CONTROL", code, json.dumps(artifact["municipalities"].get(code), ensure_ascii=False, sort_keys=True))

    meta = requests.get(SERVICE, params={"f": "json"}, timeout=30)
    meta.raise_for_status()
    source_meta = meta.json()
    print("ARCGIS_META", json.dumps({
        "name": source_meta.get("name"),
        "last_edit_date": (source_meta.get("editingInfo") or {}).get("lastEditDate"),
        "fields": [field.get("name") for field in source_meta.get("fields", [])],
    }, sort_keys=True))


if __name__ == "__main__":
    main()
