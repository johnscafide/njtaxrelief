#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
PATH = ROOT / "property/scripts/extract_transaction_municipal_requirements_v3.py"
spec = importlib.util.spec_from_file_location("req_v3", PATH)
assert spec and spec.loader
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

html = b'''<html><body>
<a href="/28323534">Chapter 635 Real Estate Transactions</a>
<a href="/28302292">Chapter 450 Housing Standards</a>
<a href="/fire">Chapter 363 Fire Prevention and Protection</a>
<a href="/login">Login</a>
<a href="https://other.example/occupancy">Certificate of Occupancy</a>
</body></html>'''
co = mod._chapter_candidates(html, "https://ecode360.com/CA1078", "resale_cco")
fire = mod._chapter_candidates(html, "https://ecode360.com/CA1078", "smoke_fire_cert")
co_urls = {x[2] for x in co}
fire_urls = {x[2] for x in fire}
assert "https://ecode360.com/28323534" in co_urls
assert "https://ecode360.com/28302292" in co_urls
assert "https://ecode360.com/fire" in fire_urls
assert not any("login" in u for u in co_urls | fire_urls)
assert not any("other.example" in u for u in co_urls | fire_urls)

co_source = "A certificate of occupancy is required before sale. The application fee is $75 and inspection must be scheduled before closing."
unrelated_fee_source = "The dog license application fee is $20 and must be renewed annually."
co_requirements = mod.v2.requirement_candidates(co_source, "resale_cco", 20)
unrelated_requirements = mod.v2.requirement_candidates(unrelated_fee_source, "resale_cco", 20)
assert co_requirements, co_requirements
assert any("$75" in item or "inspection" in item.lower() for item in co_requirements)
assert unrelated_requirements == [], unrelated_requirements

assert mod.v2._valid_application("https://town.example/forms/resale-application.pdf")
assert not mod.v2._valid_application("https://town.example/MyAccount/ProfileCreate")

print("Municipal requirement extractor contract passed")
