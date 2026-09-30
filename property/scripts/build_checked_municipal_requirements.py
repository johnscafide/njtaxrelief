#!/usr/bin/env python3
"""Turn person-approved town research into transaction_municipal_requirements rows.

Inputs (all in property/data/municipal-requirements/):
  checked/<code>.json                 town research from official sources, every fee quoted
  approvals.json                      which towns a person approved in the tracker
  nj-dca-fire-officials-2026-09.json  fire official per town from the NJ DCA directory

Output: a migration that upserts two curated rows per approved town (resale_cco and
smoke_fire_cert). Agents see these on the Transactions page as plain text lines, so
contacts and "not confirmed yet" red flags show without a frontend change.

Applied migrations are never edited. Each new migration holds only the rows that are new
or changed since the committed ones (one row per line), and the newest line for a town
and requirement wins. CI checks that the newest committed line for every approved town
matches what the data builds today.

  python3 property/scripts/build_checked_municipal_requirements.py --out supabase/migrations/<timestamp>_checked_municipal_requirements_<name>.sql
  python3 property/scripts/build_checked_municipal_requirements.py --self-test
  python3 property/scripts/build_checked_municipal_requirements.py --check
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "property/data/municipal-requirements"
SKIP_LINK = re.compile(r"/MyAccount(?:/|$|\?)|/Identity/Account/|cpauthentication\.civicplus\.com|ForgotPassword|/newsflash/", re.I)
AUTH_TYPE = {"municipal_fire_bureau": "town fire bureau", "fire_district": "fire district", "state_dca": "NJ DCA, state", "unknown": ""}
DIR_AGENCY = {"District": "fire district", "Municipal": "town", "State": "NJ DCA, state", "County": "county fire marshal"}
MIGRATIONS = ROOT / "supabase/migrations"
MIGRATION_GLOB = "*_checked_municipal_requirements_*.sql"
COLS = ["municipality_code", "municipality_name", "county", "requirement_key", "requirement_state", "title", "requirements", "fees",
        "application_url", "department_url", "source_urls", "source_excerpt", "source_hash", "last_verified_at", "metadata", "curated_note"]
ROW_KEY = re.compile(r"^  \(\$t\$(\d{4})\$t\$, .*?, \$t\$(resale_cco|smoke_fire_cert)\$t\$, ")
# Research notes sometimes point at their own JSON sections; agents see plain words instead.
INTERNAL_WORDS = [(re.compile(r"\bfire_cert\b"), "the fire certificate"), (re.compile(r"\bresale_co\b"), "the town certificate")]
EXTINGUISHER_NOTE = ("State rule: a 2025 law (P.L.2025, c.19) dropped the fire extinguisher from the state requirement. "
                     "Follow the town's current form, which may still list one.")


def clean(v, n=1200) -> str:
    s = re.sub(r"\s+", " ", str(v or "")).strip()
    s = re.sub(r"\s*[–—]\s*", ", ", s)
    for pattern, words in INTERNAL_WORDS:
        s = pattern.sub(words, s)
    if len(s) <= n:
        return s
    return s[:n - 1].rsplit(" ", 1)[0].rstrip(",;:") + "…"


def title_of(name: str) -> str:
    """A certificate name, without a long explanation in brackets."""
    name = clean(name, 400)
    if len(name) > 140 and " (" in name:
        name = name.split(" (")[0]
    return clean(name, 160)


def usable(url) -> str | None:
    return url if isinstance(url, str) and re.match(r"^https?://", url, re.I) and not SKIP_LINK.search(url) else None


def contact_line(o: dict, prefix="Contact") -> str | None:
    bits = []
    name = clean(o.get("contact_name"), 120)
    if name:
        title = clean(o.get("contact_title"), 120)
        bits.append(f"{name}, {title}" if title else name)
    for k in ("phone", "email"):
        if clean(o.get(k)):
            bits.append(clean(o.get(k), 120))
    return f"{prefix}: " + " · ".join(bits) if bits else None


def fee_rows(fees, prefix="") -> list[dict]:
    out = []
    for f in fees or []:
        amount, label = clean(f.get("amount"), 80), clean(f.get("label"), 240)
        if amount:
            out.append({"label": f"{prefix}{label}" if prefix else label, "amount": amount})
    return out


def sources(*groups) -> list[dict]:
    seen, out = set(), []
    for group in groups:
        for e in group or []:
            u = usable(e.get("url") or e.get("source_url"))
            if u and u not in seen:
                seen.add(u)
                host = re.sub(r"^https?://(www\.)?", "", u).split("/")[0]
                out.append({"url": u, "label": f"Official source ({host})"})
    return out[:8]


def inferred_not_required(co: dict) -> bool:
    """The town's pages leave the certificate out but never say in writing that none is needed."""
    return co.get("status") == "not_required" and co.get("confidence") != "high"


def flag_reasons(r: dict) -> list[str]:
    why = []
    if (r.get("resale_co") or {}).get("status") == "not_found":
        why.append("town certificate not confirmed online")
    if inferred_not_required(r.get("resale_co") or {}):
        why.append("no town certificate listed, but not ruled out in writing")
    fees = list((r.get("resale_co") or {}).get("fees") or [])
    fees += [f for a in (r.get("fire_cert") or {}).get("authorities") or [] for f in a.get("fees") or []]
    if not fees:
        why.append("no published fees found")
    return why


def co_row(r: dict, flags: list[str]) -> dict:
    co, town = r.get("resale_co") or {}, clean(r.get("municipality"), 120)
    status = co.get("status")
    lines = []
    if status == "not_found":
        lines.append(f"Not confirmed yet: Watchdog could not confirm online whether {town} requires a resale certificate. Call the office before closing.")
    elif inferred_not_required(co):
        lines.append(f"Not confirmed yet: {town}'s official pages list no town resale certificate for sales, but they don't say in writing "
                     "that none is needed. Call the office before closing.")
    elif status == "not_required":
        lines.append(f"Not required for sales, per {clean(co.get('issued_by'), 160) or town}. Confirm with the office if the buyer's lender or title company asks.")
    if clean(co.get("issued_by")):
        lines.append(f"Issued by: {clean(co.get('issued_by'), 200)}")
    c = contact_line(co)
    if c:
        lines.append(c)
    for label, key in (("Apply", "lead_time"), ("How to apply", "how_to_apply"), ("Valid for", "valid_for")):
        if clean(co.get(key)):
            lines.append(f"{label}: {clean(co.get(key))}")
    lines += [clean(x, 600) for x in (co.get("requirements") or [])[:30] if clean(x)]
    lines += [f"Also: {clean(x.get('label'), 160)}" + (f": {clean(x.get('detail'), 600)}" if clean(x.get("detail")) else "")
              for x in (r.get("other_items") or [])[:10] if clean(x.get("label"))]
    state = "verify" if inferred_not_required(co) else {"required": "explicit_required", "not_required": "official_process_found"}.get(status, "verify")
    title = title_of(co.get("name")) if status == "required" and clean(co.get("name")) else "Resale / Continued Certificate of Occupancy (CCO)"
    return {"requirement_key": "resale_cco", "requirement_state": state, "title": title, "requirements": lines,
            "fees": fee_rows(co.get("fees")), "application_url": usable(co.get("application_url")),
            "department_url": usable(co.get("department_url")), "source_urls": sources(co.get("evidence"), co.get("fees")),
            "source_excerpt": clean(next((e.get("quote") for e in co.get("evidence") or [] if e.get("quote")), ""), 900) or None}


def short_label(a: dict) -> str:
    """A short name for one of several fire authorities, e.g. "Fire District #1 (Glendora area)"."""
    area = clean(a.get("area_served"), 200).split(". ")[0]
    if area and len(area) <= 60:
        return area
    m = re.search(r"(Fire )?District (?:No\.? ?|#)\s?\d+", clean(a.get("name"), 200), re.I)
    return m.group(0) if m else clean(a.get("name"), 50)


def fire_row(r: dict, officials: list[dict]) -> dict:
    fc = r.get("fire_cert") or {}
    auths = fc.get("authorities") or []
    many = len(auths) > 1
    lines, fees = [], []
    for a in auths:
        name = clean(a.get("name"), 200)
        kind = AUTH_TYPE.get(a.get("type") or "", "")
        area = clean(a.get("area_served"), 200)
        tag = short_label(a) if many else ""
        head = (f"{tag}: issued by {name}" if many else f"Issued by: {name}") + (f" ({kind})" if kind else "")
        covers = area[len(tag):].lstrip(". ") if many and area.startswith(tag) else area
        if many and covers:
            head += f". {covers}" if area.startswith(tag) else f". Covers: {covers}"
        lines.append(head)
        who = contact_line(a, f"{tag} contact" if many else "Contact")
        if who:
            lines.append(who)
        for label, key in (("apply", "lead_time"), ("how to apply", "how_to_apply")):
            if clean(a.get(key)):
                lines.append((f"{tag}, {label}" if many else label.capitalize()) + f": {clean(a.get(key))}")
        fees += fee_rows(a.get("fees"), f"{tag}: " if many else "")
    if not auths:
        lines.append("Issuing office not confirmed yet. Call the town's fire official before closing.")
    for o in officials[:3]:
        bits = [clean(o.get("fire_official"), 120), clean(o.get("phone"), 40), clean(o.get("email"), 120)]
        bits = [b for b in bits if b]
        if bits:
            agency = DIR_AGENCY.get(o.get("agency") or "", "")
            lines.append(f"Fire official in the NJ state directory{' (' + agency + ')' if agency else ''}, updated {o.get('survey_date') or 'n/a'}: " + " · ".join(bits))
    lines += [clean(x, 600) for x in (fc.get("requirements") or [])[:30] if clean(x)]
    lines.append(EXTINGUISHER_NOTE)
    first = auths[0] if auths else {}
    return {"requirement_key": "smoke_fire_cert", "requirement_state": "explicit_required", "title": "Smoke / CO alarm certificate",
            "requirements": lines, "fees": fees, "application_url": usable(first.get("application_url")),
            "department_url": usable(first.get("department_url")),
            "source_urls": sources(*[a.get("evidence") for a in auths], *[a.get("fees") for a in auths]),
            "source_excerpt": clean(next((e.get("quote") for a in auths for e in a.get("evidence") or [] if e.get("quote")), ""), 900) or None}


def build_rows() -> list[dict]:
    approvals = json.loads((DATA / "approvals.json").read_text())["towns"]
    officials = json.loads((DATA / "nj-dca-fire-officials-2026-09.json").read_text())["towns"]
    rows = []
    for path in sorted((DATA / "checked").glob("*.json")):
        r = json.loads(path.read_text())
        code = r["municipality_code"]
        if (approvals.get(code) or {}).get("status") != "approved":
            continue
        flags = flag_reasons(r)
        town_officials = (officials.get(code) or {}).get("agencies") or []
        for row in (co_row(r, flags), fire_row(r, town_officials)):
            row.update({"municipality_code": code, "municipality_name": clean(r.get("municipality"), 120), "county": clean(r.get("county"), 60)})
            row["metadata"] = {"checked": {"researched_on": r.get("checked_at"), "approved_on": approvals[code].get("approved_on"),
                                           "needs_lookup": bool(flags), "flag_reasons": flags, "verification": r.get("verification") or {},
                                           "source": "property/data/municipal-requirements/checked/" + path.name}}
            row["source_hash"] = hashlib.sha256(json.dumps([row["requirements"], row["fees"], row["source_urls"]], sort_keys=True).encode()).hexdigest()
            row["last_verified_at"] = f"{r.get('checked_at') or '2026-09-30'}T12:00:00Z"
            row["curated_note"] = (f"Checked from official sources on {r.get('checked_at')} and approved in the NJ Resale Certificate Tracker "
                                   f"on {approvals[code].get('approved_on')}. Source: {row['metadata']['checked']['source']}"
                                   + (". Red flag: " + "; ".join(flags) if flags else ""))
            rows.append(row)
    return rows


def sql_literal(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, (dict, list)):
        return "$j$" + json.dumps(v, ensure_ascii=False, separators=(",", ":")) + "$j$::jsonb"
    s = str(v)
    assert "$t$" not in s
    return "$t$" + s + "$t$"


def row_line(row: dict) -> str:
    """One upsert row. Every row is on its own line so CI can read committed migrations back."""
    line = "  (" + ", ".join(sql_literal(row[c]) for c in COLS) + ", true)"
    assert "\n" not in line
    return line


def migration(rows: list[dict]) -> str:
    towns = sorted({r["municipality_code"] for r in rows})
    head = (f"-- Person-approved CO and fire certificate data: {len(rows)} rows for {len(towns)} towns that are new or\n"
            "-- changed since the previous checked_municipal_requirements migration.\n"
            "-- Generated by property/scripts/build_checked_municipal_requirements.py from\n"
            "-- property/data/municipal-requirements/ (checked research, approvals, NJ DCA fire officials).\n"
            "-- Do not edit by hand: change the data and generate a new migration.\n\n")
    values = ",\n".join(row_line(r) for r in rows)
    return head + (
        "insert into public.transaction_municipal_requirements\n  (" + ", ".join(COLS) + ", curated_override)\nvalues\n" + values + "\n"
        "on conflict (municipality_code, requirement_key) do update set\n"
        "  municipality_name = excluded.municipality_name,\n  county = excluded.county,\n"
        "  requirement_state = excluded.requirement_state,\n  title = excluded.title,\n"
        "  requirements = excluded.requirements,\n  fees = excluded.fees,\n"
        "  application_url = excluded.application_url,\n"
        "  department_url = coalesce(excluded.department_url, transaction_municipal_requirements.department_url),\n"
        "  source_urls = excluded.source_urls,\n  source_excerpt = excluded.source_excerpt,\n  source_hash = excluded.source_hash,\n"
        "  last_verified_at = excluded.last_verified_at,\n"
        "  metadata = transaction_municipal_requirements.metadata || excluded.metadata,\n"
        "  curated_override = true,\n  curated_note = excluded.curated_note,\n  updated_at = now();\n")


def committed() -> dict[tuple[str, str], tuple[str, str]]:
    """The newest committed line for each (town, requirement), and the migration it is in."""
    out = {}
    for path in sorted(MIGRATIONS.glob(MIGRATION_GLOB)):
        for line in path.read_text().splitlines():
            m = ROW_KEY.match(line)
            if m:
                out[(m.group(1), m.group(2))] = (line.rstrip(","), path.name)
    return out


def changed_rows() -> list[dict]:
    have = committed()
    return [row for row in build_rows() if (have.get((row["municipality_code"], row["requirement_key"])) or ("", ""))[0] != row_line(row)]


def self_test() -> None:
    rows = build_rows()
    assert rows and len(rows) % 2 == 0, len(rows)
    for row in rows:
        where = f"{row['municipality_code']} {row['requirement_key']}"
        assert row["requirements"], where
        blob = json.dumps(row, ensure_ascii=False)
        assert not re.search(r"[–—]", blob), f"{where}: em or en dash"
        assert not SKIP_LINK.search(blob), f"{where}: account or news link"
        assert not re.search(r"\b(fire_cert|resale_co|other_items|open_questions|not_found|not_required)\b|WORK/", blob.split('"metadata"')[0]), \
            f"{where}: internal research wording"
        for f in row["fees"]:
            assert re.search(r"\d", f["amount"]) or re.search(r"\b(no|free|included|none)\b", f["amount"], re.I), f"{where}: fee {f}"
        if row["requirement_key"] == "resale_cco" and row["requirement_state"] == "verify":
            assert row["requirements"][0].startswith("Not confirmed yet"), f"{where}: red flag line first"
        if row["requirement_key"] == "resale_cco" and row["requirement_state"] == "official_process_found":
            assert row["requirements"][0].startswith("Not required for sales"), f"{where}: not-required line first"
        if row["requirement_key"] == "smoke_fire_cert":
            assert row["requirements"][-1] == EXTINGUISHER_NOTE, where
        assert ROW_KEY.match(row_line(row)), where
    sql = migration(rows)
    assert sql.count("$j$") % 2 == 0 and sql.count("$t$") % 2 == 0
    assert clean("word " * 400, 50).endswith("…") and len(clean("word " * 400, 50)) <= 50
    assert clean("see fire_cert and resale_co") == "see the fire certificate and the town certificate"
    print(f"checked requirements self-test ok ({len(rows) // 2} towns, {len(rows)} rows)")


def check() -> None:
    have, rows = committed(), build_rows()
    want = {(r["municipality_code"], r["requirement_key"]): row_line(r) for r in rows}
    missing = sorted(k for k in want if k not in have)
    stale = sorted(k for k in want if k in have and have[k][0] != want[k])
    extra = sorted(k for k in have if k not in want)
    for k in stale:
        print(f"changed since {have[k][1]}: {k[0]} {k[1]}")
    assert not missing and not stale, (f"{len(missing)} approved rows are in no migration and {len(stale)} changed: "
                                       "generate a new migration with --out")
    assert not extra, f"published rows that are no longer approved: {extra}"
    files = sorted({name for _, name in have.values()})
    print(f"checked requirements migrations match the data ({len(rows) // 2} towns, newest rows in {', '.join(files)})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", help="new migration file for the rows that are new or changed")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.check:
        check()
        return 0
    if not args.out:
        raise SystemExit("--out is required")
    rows = changed_rows()
    if not rows:
        print("nothing new or changed; no migration written")
        return 0
    pathlib.Path(args.out).write_text(migration(rows))
    print(json.dumps({"towns": len({r["municipality_code"] for r in rows}), "rows": len(rows), "out": args.out}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
