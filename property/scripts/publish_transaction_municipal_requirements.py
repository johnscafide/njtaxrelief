#!/usr/bin/env python3
"""Publish governed municipal resale/CO and smoke-fire requirement rows to Supabase."""
from __future__ import annotations

import argparse
import json
import os
import re
import urllib.parse
import urllib.request

PROJECT_URL_DEFAULT = "https://uvkvaxljhhngydvlrzom.supabase.co"

# Town-website account pages (sign up, sign in, password reset) and news posts are
# never an application or an official source for a closing requirement.
SKIP_LINK = re.compile(r"/MyAccount(?:/|$|\?)|/Identity/Account/|cpauthentication\.civicplus\.com|ForgotPassword|/newsflash/", re.I)


def usable_link(url) -> bool:
    return isinstance(url, str) and url.lower().startswith(("http://", "https://")) and not SKIP_LINK.search(url)


def hold_unchecked(row: dict) -> dict:
    """Keep the scan's raw page text out of what agents see.

    The scan reads whole town pages and PDFs, so its "requirements" and "fees" include
    website menus, blank form lines, fines and grant amounts. Until a person checks the
    town (curated_override), that text lives in metadata.unchecked for research, and
    agents get the official links instead.
    """
    out = dict(row)
    metadata = dict(out.get("metadata") or {})
    application_url = out.get("application_url")
    metadata["unchecked"] = {
        "requirements": out.get("requirements") or [],
        "fees": out.get("fees") or [],
        "application_url": application_url,
    }
    sources = [s for s in (out.get("source_urls") or []) if isinstance(s, dict) and usable_link(s.get("url"))]
    if usable_link(application_url) and all(s.get("url") != application_url for s in sources):
        sources.insert(0, {"url": application_url, "label": "Form found by the automatic scan (not checked yet)"})
    out.update({"requirements": [], "fees": [], "application_url": None, "source_urls": sources, "metadata": metadata})
    for key in ("department_url", "ordinance_url"):
        if out.get(key) and not usable_link(out[key]):
            out[key] = None
    return out


def self_test() -> None:
    row = hold_unchecked({
        "municipality_code": "1331", "requirement_key": "resale_cco", "requirements": ["Website Sign In Search About Us"],
        "fees": [{"label": "Foundation Provides $10,000 for Grover House", "amount": "$10,000"}],
        "application_url": "https://www.example-nj.org/MyAccount/ProfileCreate",
        "department_url": "https://www.example-nj.org/", "metadata": {"extractor_version": 3},
        "source_urls": [{"url": "https://www.example-nj.org/Identity/Account/Login?x=1", "label": "Sign in"},
                        {"url": "https://www.example-nj.org/m/newsflash/home/detail/1051", "label": "Mayor news"},
                        {"url": "https://www.example-nj.org/DocumentCenter/View/1/CCO", "label": "CCO application"}],
    })
    assert row["requirements"] == [] and row["fees"] == [] and row["application_url"] is None, row
    assert row["metadata"]["unchecked"]["fees"][0]["amount"] == "$10,000", row
    assert row["metadata"]["extractor_version"] == 3, row
    assert [s["url"] for s in row["source_urls"]] == ["https://www.example-nj.org/DocumentCenter/View/1/CCO"], row
    form = hold_unchecked({"application_url": "https://www.example-nj.org/resale-application.pdf", "source_urls": []})
    assert form["source_urls"][0]["url"].endswith("resale-application.pdf") and form["application_url"] is None, form
    print("publish self-test ok")


def request_json(url: str, key: str):
    req = urllib.request.Request(url, method="GET", headers={
        "Authorization": f"Bearer {key}", "apikey": key, "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.loads(response.read().decode("utf-8") or "[]")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.input:
        raise SystemExit("--input is required")
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
    publish_rows = [hold_unchecked(r) for r in rows if (str(r.get("municipality_code") or ""), str(r.get("requirement_key") or "")) not in curated]

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