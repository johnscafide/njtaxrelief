#!/usr/bin/env python3
"""Build Watchdog v0.39 governed UFB source artifacts from the official NJ DCA XLSM.

Uses Python standard library only. The workbook is treated as the source artifact;
cached formula values from the OOXML are read without recalculation.
"""
from __future__ import annotations
import argparse, hashlib, json, re, zipfile
from collections import defaultdict
from pathlib import Path
import xml.etree.ElementTree as ET

EXPECTED_SHA256 = "79a59be4c4ab2669d60ebb8072aab5a5775df7025e66cb95a887e1c39ed8ccaa"
RELEASE = "nj-dca-ufb-2025-2025-10-23-v1"
PROVIDER_VERSION = "nj-dca-ufb-v039"
SOURCE_ID = "nj-dca-user-friendly-budget"
SOURCE_URL = "https://nj.gov/dca/dlgs/programs/mc_budget_docs/UFB%20Database%20-%20FINAL.xlsm"
SOURCE_TEXT = f"NJ DCA User Friendly Budget Database · 2025 Summary · self-reported/unaudited municipal submissions · {RELEASE}"
WARNING = (
    "Official NJ DCA compilation of municipal User Friendly Budget submissions. "
    "DCA states all data are self-reported by municipalities and have not been independently audited or verified; "
    "missing submissions and blank/obvious-error cells may have no data."
)
NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def colnum(ref: str) -> int:
    letters = re.match(r"([A-Z]+)", ref).group(1)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n

def read_shared(z: zipfile.ZipFile):
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    return ["".join(t.text or "" for t in si.findall(".//m:t", NS)) for si in root.findall("m:si", NS)]

def sheet_targets(z: zipfile.ZipFile):
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    relroot = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rels = {r.attrib["Id"]: r.attrib["Target"] for r in relroot}
    out = {}
    for s in wb.find("m:sheets", NS):
        rid = s.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        target = rels[rid]
        if not target.startswith("xl/"):
            target = "xl/" + target
        out[s.attrib["name"]] = target
    return out

def read_sheet(z: zipfile.ZipFile, target: str, shared):
    root = ET.fromstring(z.read(target))
    rows = {}
    for row in root.findall(".//m:sheetData/m:row", NS):
        rn = int(row.attrib["r"])
        vals = {}
        for c in row.findall("m:c", NS):
            cn = colnum(c.attrib["r"])
            typ = c.attrib.get("t")
            v = c.find("m:v", NS)
            isel = c.find("m:is", NS)
            val = None
            if typ == "s" and v is not None:
                val = shared[int(v.text)]
            elif typ == "inlineStr" and isel is not None:
                val = "".join(t.text or "" for t in isel.findall(".//m:t", NS))
            elif v is not None:
                raw = v.text
                if typ == "b":
                    val = raw == "1"
                elif typ == "str":
                    val = raw
                else:
                    try:
                        f = float(raw)
                        val = int(f) if f.is_integer() else f
                    except Exception:
                        val = raw
            vals[cn] = val
        rows[rn] = vals
    return rows

def clean(v):
    return None if v in (None, "--", "No data") else v

def slug(s: str) -> str:
    s = s.lower().strip().replace("&", " and ").replace("%", " pct ").replace("/", " ")
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workbook", type=Path)
    ap.add_argument("--repo-root", type=Path, default=Path("."))
    args = ap.parse_args()
    if sha256(args.workbook) != EXPECTED_SHA256:
        raise SystemExit("UFB workbook SHA-256 does not match the certified uploaded/source artifact")

    with zipfile.ZipFile(args.workbook) as z:
        shared = read_shared(z)
        targets = sheet_targets(z)
        rows = read_sheet(z, targets["2025 Summary"], shared)
        grow = read_sheet(z, targets["Glossary"], shared)

    group_by_col = {}
    grp = None
    for c in range(1, 417):
        if rows.get(4, {}).get(c) not in (None, ""):
            grp = rows[4][c]
        group_by_col[c] = grp

    glossary = {}
    for rn in range(4, 128):
        term = grow.get(rn, {}).get(2)
        desc = grow.get(rn, {}).get(3)
        if term and desc:
            glossary[slug(str(term))] = str(desc).strip()

    muni_rows = []
    for rn, vals in rows.items():
        code = vals.get(1)
        if isinstance(code, str) and re.fullmatch(r"\d{4}", code):
            muni_rows.append((rn, code, vals.get(3), vals.get(4), vals.get(6), vals.get(7)))
    if len(muni_rows) != 564:
        raise SystemExit(f"Expected 564 current municipalities, found {len(muni_rows)}")

    selected = list(range(13,18))+list(range(19,67))+list(range(68,140))+list(range(189,197))+list(range(315,354))+list(range(397,399))+list(range(402,407))
    coverage = {c: sum(clean(rows[rn].get(c)) is not None for rn, *_ in muni_rows) for c in selected}

    fields = []
    fin = ["attorney","agent","lender","appraiser","investor","municipal"]
    debt_prof = ["attorney","agent","lender","appraiser","investor","municipal","insurance"]
    personnel = ["attorney","investor","municipal"]

    def add(c, field_id, label, category, unit, professions, glossary_term=None):
        group = group_by_col[c]
        heading = rows[5].get(c)
        desc = f"NJ DCA User Friendly Budget 2025 Summary source field: {group} — {heading}."
        if glossary_term:
            gd = glossary.get(slug(glossary_term))
            if gd:
                desc += f" DCA glossary: {gd}"
        fields.append({
            "column": c,
            "field": field_id,
            "marker_id": f"njplus.nj-dca-ufb-2025.{field_id}",
            "label": label,
            "description": desc,
            "category": category,
            "scope": "municipality",
            "tier": "pro_plus",
            "origin": "public",
            "proprietary": False,
            "professions": professions,
            "source_id": SOURCE_ID,
            "source_field": f"{group} · {heading}",
            "source_group": group,
            "source_heading": heading,
            "unit": unit,
            "coverage_municipalities": coverage[c],
        })

    for row in [
        (13,"rut_tax_collection_pct","RUT tax collection percentage","ratio","% of Tax Collections used to Calculate RUT"),
        (14,"prior_year_total_tax_revenue_collections","Prior-year total tax revenue collected","currency","Total Tax Revenue, Collections CY"),
        (15,"prior_year_total_tax_levy","Prior-year total tax levy","currency","Total Tax Levy, CY"),
        (16,"prior_year_tax_collection_pct","Prior-year tax collection percentage","ratio","% of Taxes Collected, CY"),
        (17,"prior_year_delinquent_taxes","Prior-year-end delinquent taxes","currency","Delinquent Taxes"),
    ]:
        c,f,l,u,g = row; add(c,f,l,"municipal_tax",u,fin,g)

    rev_names = [
        "surplus","local_revenue","state_aid","uniform_construction_code_fees","shared_services_agreements",
        "additional_revenue_offset_by_appropriations","public_private_revenue","other_special_items",
        "receipts_from_delinquent_taxes","local_tax_for_municipal_purposes","minimum_library_tax",
        "open_space_levy_tax","arts_cultural_levy_tax","addition_to_local_district_school_tax",
        "deficit_general_budget","total"
    ]
    rev_gloss = [
        "Surplus","Local Revenue","State Aid (without offsetting appropriation)","Uniform Construction Code Fees","Shared Services Agreements",
        "Additional Revenue Offset by Appropriations","Public and Private Revenue","Other Special Items","Receipts from Delinquent Taxes",
        "Local Tax for Municipal Purposes","Minimum Library Tax","Open Space Levy Tax",None,"Addition to Local District School Tax",
        "Deficit General Budget",None
    ]
    for start,prefix,labelprefix in [
        (19,"prior_year_realized_revenue","Prior-year realized revenue"),
        (35,"current_year_anticipated_revenue","Current-year anticipated revenue"),
        (51,"current_year_general_budget_revenue","Current-year general budget revenue"),
    ]:
        for i,(name,gterm) in enumerate(zip(rev_names,rev_gloss)):
            c=start+i
            add(c,f"{prefix}_{name}",f"{labelprefix}: {rows[5][c]}","municipal_revenue","currency",fin,gterm)

    app_names = [
        "general_government","land_use_administration","uniform_construction_code","insurance","public_safety","public_works",
        "health_human_services","parks_recreation","education_library","unclassified","utilities_bulk_purchases",
        "landfill_solid_waste_disposal","contingency","statutory_expenditures","judgements","shared_services",
        "court_public_defender","capital","debt","deferred_charges","debt_type_1_school_district",
        "reserve_for_uncollected_taxes","surplus_general_budget","total"
    ]
    app_gloss = [
        "General Government","Land-Use Administration","Uniform Construction Code","Insurance","Public Safety","Public Works",
        "Health and Human Services","Parks and Recreation","Education (including Library)","Unclassified","Utilities and Bulk Purchases",
        "Landfill / Solid Waste Disposal","Contingency","Statutory Expenditures","Judgements","Shared Services",
        "Court and Public Defender","Capital","Debt","Deferred Charges","Debt - Type 1 School District",
        "Reserve for Uncollected Taxes","Surplus General Budget","Total Appropriations"
    ]
    for start,prefix,labelprefix in [
        (68,"prior_year_modified_appropriation","Prior-year modified appropriation"),
        (92,"current_year_appropriation","Current-year appropriation"),
        (116,"current_year_general_budget_appropriation","Current-year general budget appropriation"),
    ]:
        for i,(name,gterm) in enumerate(zip(app_names,app_gloss)):
            c=start+i
            add(c,f"{prefix}_{name}",f"{labelprefix}: {rows[5][c]}","municipal_appropriation","currency",fin,gterm)

    for row in [
        (189,"total_full_time_employees","Total full-time employees","count",None),
        (190,"total_part_time_employees","Total part-time employees","count",None),
        (191,"total_personnel_cost","Total personnel cost","currency","Total Personnel Costs"),
        (192,"total_base_pay","Total base pay","currency","Base Pay"),
        (193,"total_overtime_other_compensation","Total overtime and other compensation","currency","Overtime and other Compensation"),
        (194,"total_pension_estimate","Total pension estimate","currency","Pension (Estimate)"),
        (195,"total_health_benefits_net_cost_share","Total health benefits net of cost share","currency","Health Benefits Net of Cost Share"),
        (196,"total_employment_taxes_other_benefits","Total employment taxes and other benefits","currency","Employment Taxes and Other Benefits"),
    ]:
        c,f,l,u,g=row; add(c,f,l,"municipal_personnel",u,personnel,g)

    debt = [
        (315,"gross_debt_local_school","Gross debt: local school debt","currency","Local School Debt"),
        (316,"gross_debt_regional_school","Gross debt: regional school debt","currency","Regional School Debt"),
        (317,"gross_debt_utility_fund","Gross debt: utility fund debt","currency","Utility Fund Debt"),
        (318,"gross_debt_authorized","Gross debt: debt authorized","currency","Debt Authorized"),
        (319,"gross_debt_notes_outstanding","Gross debt: notes outstanding","currency","Notes Outstanding"),
        (320,"gross_debt_bonds_outstanding","Gross debt: bonds outstanding","currency","Bonds Outstanding"),
        (321,"gross_debt_loans_other","Gross debt: loans and other debt","currency","Loans and Other Debt"),
        (322,"gross_debt_total","Gross debt","currency","Gross Debt"),
        (323,"gross_debt_per_capita","Per-capita gross debt","currency_per_capita","Per Capita Gross Debt"),
        (324,"gross_debt_deductions","Gross debt deductions","currency","Deductions"),
        (325,"net_debt_local_school","Net-debt section: local school debt","currency","Local School Debt"),
        (326,"net_debt_regional_school","Net-debt section: regional school debt","currency","Regional School Debt"),
        (327,"net_debt_utility_fund","Net-debt section: utility fund debt","currency","Utility Fund Debt"),
        (328,"net_debt_authorized","Net-debt section: debt authorized","currency","Debt Authorized"),
        (329,"net_debt_notes_outstanding","Net-debt section: notes outstanding","currency","Notes Outstanding"),
        (330,"net_debt_bonds_outstanding","Net-debt section: bonds outstanding","currency","Bonds Outstanding"),
        (331,"net_debt_loans_other","Net-debt section: loans and other debt","currency","Loans and Other Debt"),
        (332,"net_debt_total","Net debt","currency","Net Debt"),
        (333,"net_debt_per_capita","Per-capita net debt","currency_per_capita","Per Capita Net Debt"),
        (334,"net_debt_three_year_avg_property_valuation","Three-year average property valuation","currency","3 Yr. Average Property Valuation"),
        (335,"net_debt_share_three_year_avg_property_valuation","Net debt as share of three-year average property valuation","ratio","Net Debt as % of 3 Year Avg Property Valuation"),
        (336,"debt_service_utility_fund_principal","Debt service: utility fund principal","currency","Utility Fund - Principal"),
        (337,"debt_service_utility_fund_interest","Debt service: utility fund interest","currency","Utility Fund - Interest"),
        (338,"debt_service_bond_anticipation_notes_principal","Debt service: bond anticipation notes principal","currency","Bond Anticipation Notes - Principal"),
        (339,"debt_service_bond_anticipation_notes_interest","Debt service: bond anticipation notes interest","currency","Bond Anticipation Notes - Interest"),
        (340,"debt_service_bonds_principal","Debt service: bonds principal","currency","Bonds - Principal"),
        (341,"debt_service_bonds_interest","Debt service: bonds interest","currency","Bonds - Interest"),
        (342,"debt_service_loans_other_principal","Debt service: loans and other debt principal","currency","Loans & Other Debt - Principal"),
        (343,"debt_service_loans_other_interest","Debt service: loans and other debt interest","currency","Loans & Other Debt - Interest"),
        (344,"debt_service_total_principal","Debt service: total principal","currency","Total Principal"),
        (345,"debt_service_total_interest","Debt service: total interest","currency","Total Interest"),
        (346,"debt_service_current_year_budget_payment","Current-year budget debt payment","currency","CY Budget Debt Pmt"),
        (347,"debt_service_second_year_budget_payment","Second-year budget debt payment","currency","(Year 2) Budget Debt Pmt"),
        (348,"debt_service_third_year_budget_payment","Third-year budget debt payment","currency","(Year 3) Budget Debt Pmt"),
        (349,"debt_service_future_year_budget_payment","Future-year budget debt payment","currency","Future Year Budget Debt Pmt"),
        (350,"debt_service_total_governmental_guarantees","Total governmental guarantees","currency","Total Guarantees - Governmental"),
        (351,"debt_service_total_other_guarantees","Total other guarantees","currency","Total Guarantees - Other"),
        (352,"debt_service_total_capital_equipment_leases","Total capital/equipment leases","currency","Total Capital/Equipment Leases"),
        (353,"debt_service_total_other","Total other debt payments","currency","Total Other"),
    ]
    for c,f,l,u,g in debt:
        add(c,f,l,"municipal_debt",u,debt_prof,g)

    for c,f,l,g,u in [
        (397,"accumulated_absence_gross_days","Gross days of accumulated absence","Gross Days of Accumulated Absence","days"),
        (398,"accumulated_absence_compensated_value","Dollar value of compensated absences","Dollar Value of Compensated Absences","currency"),
    ]:
        add(c,f,l,"municipal_personnel",u,personnel,g)

    for c,f,l,g in [
        (402,"structural_revenues_at_risk","Structural imbalance: revenues at risk","Revenues at Risk"),
        (403,"structural_nonrecurring_appropriation_reductions","Structural imbalance: non-recurring appropriation reductions","Non-recurring Appropriation Reductions"),
        (404,"structural_future_year_appropriation_increases","Structural imbalance: future-year appropriation increases","Future Year Appropriation Increases"),
        (405,"structural_imbalance_offsets","Structural imbalance offsets","Structural Imbalance Offsets"),
        (406,"structural_total_imbalances","Total identified structural imbalances","Total Imbalances"),
    ]:
        add(c,f,l,"municipal_structural_balance","currency",fin,g)

    if len(fields) != 179 or len({f["marker_id"] for f in fields}) != 179:
        raise SystemExit("Expected 179 unique v0.39 fields")

    counties = defaultdict(dict)
    no_ufb = sig_missing = 0
    for rn, code, name, county, no_flag, sig_flag in muni_rows:
        no = bool(no_flag); sig = bool(sig_flag)
        no_ufb += int(no); sig_missing += int(sig)
        values = [clean(rows[rn].get(f["column"])) for f in fields]
        counties[code[:2]][code] = [name, county, no, sig, values]

    root = args.repo_root
    data_dir = root / "property/data/ufb-v039"
    data_dir.mkdir(parents=True, exist_ok=True)
    for old in data_dir.glob("*.json"):
        old.unlink()

    manifest = {
        "schema_version": 1,
        "release": RELEASE,
        "provider_version": PROVIDER_VERSION,
        "source_id": SOURCE_ID,
        "source_url": SOURCE_URL,
        "source_sheet": "2025 Summary",
        "budget_year": 2025,
        "workbook_sha256": EXPECTED_SHA256,
        "workbook_modified_at": "2025-10-23T19:27:54Z",
        "municipality_count": 564,
        "county_count": 21,
        "quality_flags": {"no_ufb_available": no_ufb, "significant_data_missing": sig_missing},
        "missing_value_tokens": ["--","No data"],
        "warning": WARNING,
        "source_text": SOURCE_TEXT,
        "field_count": 179,
        "field_order": [f["marker_id"] for f in fields],
        "fields": [
            {k: f[k] for k in ("marker_id","field","source_field","source_group","source_heading","unit","coverage_municipalities")}
            for f in fields
        ],
    }
    (data_dir / "manifest.json").write_text(json.dumps(manifest, separators=(",",":")) + "\n", encoding="utf-8")
    for cc, data in sorted(counties.items()):
        payload = {"schema_version":1,"release":RELEASE,"county_code":cc,"municipalities":data}
        (data_dir / f"{cc}.json").write_text(json.dumps(payload, separators=(",",":")) + "\n", encoding="utf-8")

    pack = {
        "schema_version": 1,
        "version": "0.39.0",
        "released": "2026-08-28",
        "definition": "179 exact municipality-level public-source fields from the NJ DCA User Friendly Budget Database 2025 Summary. No derived score or qualitative inference is included.",
        "activation_rule": "Markers enter planned. Live state requires a committed source artifact, authenticated production canary, provider coverage, and static governance reconciliation.",
        "source_contract": {
            "source_id": SOURCE_ID,
            "source_release": RELEASE,
            "budget_year": 2025,
            "source_url": SOURCE_URL,
            "source_sheet": "2025 Summary",
            "workbook_sha256": EXPECTED_SHA256,
            "municipality_count": 564,
            "no_ufb_available_count": no_ufb,
            "significant_data_missing_count": sig_missing,
            "source_artifact": "property/data/ufb-v039/manifest.json + county 01–21 JSON shards",
            "warning": WARNING,
        },
        "markers": [{k:v for k,v in f.items() if k != "column"} for f in fields],
    }
    (root / "property/data/nj-source-pack-v039.json").write_text(json.dumps(pack, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "markers": len(fields),
        "municipalities": 564,
        "counties": 21,
        "no_ufb_available": no_ufb,
        "significant_data_missing": sig_missing,
        "coverage_min": min(coverage.values()),
        "coverage_max": max(coverage.values()),
    }, sort_keys=True))

if __name__ == "__main__":
    main()
