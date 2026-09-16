#!/usr/bin/env python3
"""Publish municipal/county transaction provider discovery into the service-only Supabase registry.

Discovery is routing metadata only. It never means that an account/record search completed,
and it never authorizes bypassing logins, CAPTCHAs, subscriptions, or premium access.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from urllib.parse import urlparse

PROJECT_URL_DEFAULT = "https://uvkvaxljhhngydvlrzom.supabase.co"
SOCIAL_HOSTS = {"facebook.com","twitter.com","x.com","reddit.com","linkedin.com","pinterest.com","plus.google.com","web.whatsapp.com"}
IRRELEVANT_HOSTS = {"cdn.shopify.com","propertytaxreliefapp.nj.gov","propertytaxreliefstatus.nj.gov","njpropertytaxguide.com","state.nj.us","nj.gov","tctanj.org"}
COUNTY_NOISE = re.compile(r"military|veteran|standard[- ]form[- ]180|passport|election|voter|medical[- ]emergency|payment[- ]program[- ]for[- ]aliens|roadway[- ]capital|completed[- ]projects", re.I)


def host(url: str) -> str:
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def normalize_provider(p: dict) -> dict:
    p = dict(p)
    h = host(str(p.get("url") or ""))
    if "wipp" in h or "edmundsgovtech.cloud" in h or "edmundsassoc.com" in h:
        p.update(provider_key="edmunds_wipp", provider_label="Edmunds GovTech / WIPP", public_search_modes=["address","block_lot","account","owner_name"])
    elif h == "tax.munidex.info":
        p.update(provider_key="munidex", provider_label="Munidex", public_search_modes=["address","block_lot","account","owner_name"])
    elif h.endswith("cit-e.net"):
        p.update(provider_key="cite_tax_inquiry", provider_label="CIT-E Tax / Utility Inquiry", public_search_modes=["block_lot","tax_account","street","utility_account","utility_street"])
    elif h == "apps.hlssystems.com":
        p.update(provider_key="hls_systems", provider_label="HLS Systems Property Tax Inquiry", public_search_modes=["block_lot","account","property_location"])
    elif h == "webportal.municipal-software.com":
        p.update(provider_key="municipal_software", provider_label="Municipal Software Web Portal")
    elif h == "secure.municipay.com":
        p.update(provider_key="municipay", provider_label="Municipay")
    elif h == "edmundsgovpay.com":
        p.update(provider_key="edmunds_govpay", provider_label="Edmunds GovPay")
    elif h.endswith("newjerseytaxsale.com"):
        p.update(provider_key="nj_tax_sale_portal", provider_label="New Jersey Tax Sale Portal", families=["tax_sale_delinquency"])
    return p


def relevant_external(raw: dict) -> bool:
    p = normalize_provider(raw)
    url = str(p.get("url") or "")
    h = host(url)
    if not url.startswith(("http://","https://")) or h in SOCIAL_HOSTS or h in IRRELEVANT_HOSTS:
        return False
    key = str(p.get("provider_key") or "")
    if key == "munidex": return h == "tax.munidex.info"
    if key == "edmunds_wipp": return "edmund" in h or "wipp" in h
    if key in {"cite_tax_inquiry","hls_systems","municipal_software","municipay","edmunds_govpay","nj_tax_sale_portal"}: return True
    families = set(p.get("families") or [])
    return bool(families & {"tax_collector","water_sewer","tax_sale_delinquency"})


def access_for(provider_key: str, provider_url: str) -> tuple[str, str]:
    h = host(provider_url)
    if provider_key in {"edmunds_wipp","munidex","cite_tax_inquiry","hls_systems"}: return "public_anonymous_search", "live"
    if provider_key == "municipal_software": return "public_or_guest_portal", "adapter_pending"
    if provider_key in {"municipay","edmunds_govpay"}: return "public_or_guest_portal", "review_required"
    if provider_key == "nj_tax_sale_portal" or "newjerseytaxsale.com" in h: return "public_tax_sale_portal", "review_required"
    if provider_key == "official_municipal_site": return "official_site", "source_only"
    return "discovered_external", "review_required"


def municipal_rows(doc: dict) -> list[dict]:
    out: list[dict] = []
    generated = doc.get("generated_at") or datetime.now(timezone.utc).isoformat()
    for r in doc.get("results", []):
        code = str(r.get("municipality_code") or "").strip()
        if len(code) != 4: continue
        label = str(r.get("municipality_label") or code)
        county = str(r.get("county") or "")
        root = str(r.get("root_url") or r.get("directory_source") or "")
        providers = [normalize_provider(p) for p in (r.get("external_providers") or []) if relevant_external(p)]
        provider_keys = {str(p.get("provider_key") or "") for p in providers}
        seen: set[tuple[str,str]] = set()
        for p in providers:
            pkey = str(p.get("provider_key") or "unclassified_external")
            purl = str(p.get("url") or root)
            sig = (pkey,purl)
            if sig in seen: continue
            seen.add(sig)
            access, status = access_for(pkey,purl)
            evidence_families=list(p.get("families") or [])
            metadata={"municipality_key":r.get("municipality_key"),"root_url":r.get("root_url"),"public_search_modes":p.get("public_search_modes") or [],"coverage":r.get("coverage") or {}}
            if pkey == "nj_tax_sale_portal":
                metadata.update({"automation_authorized":False,"manual_search_required":True,"search_completed":False,"access_note":"Official municipal tax-sale portal identified; Watchdog has no certified machine-access contract. Use authorized manual search unless a permitted integration is established."})
            elif pkey in {"municipay","edmunds_govpay"}:
                metadata.update({"automation_authorized":False,"manual_search_required":True,"search_completed":False,"access_note":"Payment/lookup portal discovered, but no certified machine-query contract is configured. Preserve as an official manual route unless a permitted adapter is proven."})
            elif pkey == "municipal_software":
                metadata.update({"automation_authorized":False,"search_completed":False,"adapter_proof_required":True})
            if pkey == "edmunds_govpay" and "edmunds_wipp" in provider_keys:
                status="source_only";evidence_families=[]
                metadata.update({"supplemental_payment_portal":True,"evidence_route":False,"canonical_evidence_provider":"edmunds_wipp"})
            out.append({
                "jurisdiction_type":"municipality","jurisdiction_key":code,"jurisdiction_name":label,"county":county,
                "provider_key":pkey,"provider_label":str(p.get("provider_label") or host(purl) or pkey),"provider_url":purl,
                "evidence_families":evidence_families,"access_mode":access,"adapter_status":status,
                "source_url":str(p.get("discovered_from") or root),"metadata":metadata,
                "last_verified_at":generated,"updated_at":generated,
            })
        if not providers:
            purl = root or "https://www.nj.gov/nj/gov/county/localgov.shtml"
            out.append({
                "jurisdiction_type":"municipality","jurisdiction_key":code,"jurisdiction_name":label,"county":county,
                "provider_key":"official_municipal_site","provider_label":"Official municipal source","provider_url":purl,
                "evidence_families":[k for k,v in (r.get("coverage") or {}).items() if v],"access_mode":"official_site","adapter_status":"source_only",
                "source_url":purl,"metadata":{"municipality_key":r.get("municipality_key"),"root_url":r.get("root_url"),"coverage":r.get("coverage") or {},"status":r.get("status")},
                "last_verified_at":generated,"updated_at":generated,
            })
    return out


def county_noise(item: dict) -> bool:
    text = f"{item.get('label') or ''} {item.get('url') or ''}"
    return bool(COUNTY_NOISE.search(text))


def county_rows(doc: dict) -> list[dict]:
    out: list[dict] = []
    generated = doc.get("generated_at") or datetime.now(timezone.utc).isoformat()
    for r in doc.get("counties", []):
        name = str(r.get("county") or "").strip()
        if not name: continue
        key = name.upper()
        root = str(r.get("root_url") or "") or "https://www.nj.gov/nj/gov/county/"
        candidates: list[tuple[str,dict]] = []
        for family in ("clerk_land_records","search_portal","deeds_mortgages","liens","bulk_api"):
            for item in (r.get("candidates") or {}).get(family, [])[:8]:
                u = str(item.get("url") or "")
                h = host(u)
                if not u.startswith(("http://","https://")) or h in SOCIAL_HOSTS: continue
                if county_noise(item): continue
                if any(x in u.lower() for x in ("medicaid","vaping","sheriff-sale","subscription.aspx")): continue
                candidates.append((family,item))
        seen: set[str] = set()
        for family,item in candidates:
            u = str(item.get("url") or "")
            if u in seen: continue
            seen.add(u)
            h = host(u)
            access = "official_public_search" if any(k in (u+" "+str(item.get("label") or "")).lower() for k in ("search","records","landrecords","property records")) else "official_information"
            if "camden" in h and ("premium" in (str(item.get("label") or "").lower()) or "account" in u.lower()): access = "mixed_free_and_premium"
            out.append({
                "jurisdiction_type":"county","jurisdiction_key":key,"jurisdiction_name":f"{name} County","county":name,
                "provider_key":f"county_{h.replace('.','_') or 'official'}","provider_label":str(item.get("label") or h or f"{name} County records"),"provider_url":u,
                "evidence_families":[family],"access_mode":access,"adapter_status":"source_only","source_url":root,
                "metadata":{"root_url":r.get("root_url"),"discovery_family":family,"status":r.get("status"),"search_completed":False},"last_verified_at":generated,"updated_at":generated,
            })
        if not seen:
            out.append({
                "jurisdiction_type":"county","jurisdiction_key":key,"jurisdiction_name":f"{name} County","county":name,
                "provider_key":"county_official_site","provider_label":f"{name} County official records source","provider_url":root,
                "evidence_families":[],"access_mode":"official_site","adapter_status":"source_only","source_url":root,
                "metadata":{"status":r.get("status"),"search_completed":False},"last_verified_at":generated,"updated_at":generated,
            })
    return out


def publish(rows: list[dict]) -> None:
    url = os.environ.get("SUPABASE_URL") or PROJECT_URL_DEFAULT
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not key: raise SystemExit("SUPABASE_SERVICE_ROLE_KEY is required for publish")
    endpoint = url.rstrip("/") + "/rest/v1/transaction_provider_registry?on_conflict=" + urllib.parse.quote("jurisdiction_type,jurisdiction_key,provider_key,provider_url", safe=",")
    for i in range(0,len(rows),100):
        body = json.dumps(rows[i:i+100], separators=(",",":"), ensure_ascii=False).encode()
        req = urllib.request.Request(endpoint, data=body, method="POST", headers={"Authorization":f"Bearer {key}","apikey":key,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"})
        with urllib.request.urlopen(req, timeout=45) as resp:
            if resp.status not in (200,201,204): raise RuntimeError(f"Registry publish failed HTTP {resp.status}")
    print(json.dumps({"published_rows":len(rows),"municipal_rows":sum(r["jurisdiction_type"]=="municipality" for r in rows),"county_rows":sum(r["jurisdiction_type"]=="county" for r in rows)}))


def main() -> int:
    ap=argparse.ArgumentParser();ap.add_argument("--municipal",required=True);ap.add_argument("--county",required=True);args=ap.parse_args()
    with open(args.municipal,encoding="utf-8") as f: municipal=json.load(f)
    with open(args.county,encoding="utf-8") as f: county=json.load(f)
    rows=municipal_rows(municipal)+county_rows(county)
    publish(rows)
    return 0

if __name__=="__main__": raise SystemExit(main())
