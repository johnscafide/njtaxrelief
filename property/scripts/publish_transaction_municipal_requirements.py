#!/usr/bin/env python3
"""Publish governed municipal resale/CO and smoke-fire requirement rows to Supabase."""
from __future__ import annotations

import argparse
import json
import os
import urllib.parse
import urllib.request

PROJECT_URL_DEFAULT = "https://uvkvaxljhhngydvlrzom.supabase.co"


def request_json(url: str, key: str):
    req = urllib.request.Request(url, method="GET", headers={
        "Authorization": f"Bearer {key}", "apikey": key, "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.loads(response.read().decode("utf-8") or "[]")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    args = ap.parse_args()
    with open(args.input, encoding="utf-8") as f:
        doc = json.load(f)
    rows = doc.get("rows") or []
    municipalities = {str(r.get("municipality_code") or "") for r in rows}
    if len(municipalities) != 564 or len(rows) != 1128:
        raise SystemExit(f"Refusing partial publish: municipalities={len(municipalities)} rows={len(rows)}")
    url = os.environ.get("SUPABASE_URL") or PROJECT_URL_DEFAULT
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not key:
        raise SystemExit("SUPABASE_SERVICE_ROLE_KEY is required")

    curated_url = url.rstrip("/") + "/rest/v1/transaction_municipal_requirements?select=municipality_code,requirement_key&curated_override=eq.true"
    curated_rows = request_json(curated_url, key)
    curated = {(str(r.get("municipality_code") or ""), str(r.get("requirement_key") or "")) for r in curated_rows}
    publish_rows = [r for r in rows if (str(r.get("municipality_code") or ""), str(r.get("requirement_key") or "")) not in curated]

    conflict = urllib.parse.quote("municipality_code,requirement_key", safe=",")
    endpoint = url.rstrip("/") + "/rest/v1/transaction_municipal_requirements?on_conflict=" + conflict
    for i in range(0, len(publish_rows), 100):
        body = json.dumps(publish_rows[i:i+100], ensure_ascii=False, separators=(",", ":")).encode()
        req = urllib.request.Request(endpoint, data=body, method="POST", headers={
            "Authorization": f"Bearer {key}", "apikey": key, "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        })
        with urllib.request.urlopen(req, timeout=45) as response:
            if response.status not in (200, 201, 204):
                raise RuntimeError(f"Requirements publish failed HTTP {response.status}")
    print(json.dumps({"published": len(publish_rows), "curated_preserved": len(curated), "municipalities": len(municipalities)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())