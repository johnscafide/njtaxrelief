#!/usr/bin/env python3
"""Recover and activate official NJ 2016-2017 residential COD history.

Downloads the 21 official NJ Division of Taxation 2017 county COD tables,
requires exact source-file hashes, parses the segmented Property Class 2 COD,
reconciles the historical 565-municipality source plane to Watchdog's current
564-district identity manifest, and patches the governed runtime/canary path.

Fail-closed rules:
- Blank source COD remains null.
- Printed 0.00 with zero Class 2 sales is a non-observation (null).
- Printed 0.00 with positive Class 2 sales is preserved as a real zero.
- The only allowed unmatched historical identity is retired Pine Valley Borough,
  Camden County, whose entire 2014-2017 source record is blank.
"""
from __future__ import annotations

import hashlib
import json
import re
import tempfile
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
TOWNS = ROOT / "towns/town-manifest.json"
OUT = ROOT / "property/data/cod/historical-cod-2016-2017.json"
HYDRATE = ROOT / "supabase/functions/workbench-hydrate/index.ts"
CANARY = ROOT / "supabase/functions/provider-release-canary/index-v2.ts"
MANIFEST = ROOT / "property/data/cod/SOURCE-MANIFEST.md"

BASE_URL = "https://www.nj.gov/treasury/taxation/pdf/lpt/"
SOURCES = {
    "devatl.pdf": ("ATLANTIC", "900e8751e99eb34f5b3aa6bc24fd12fc289504e0833af0f2d03a447257aa13fc"),
    "devber.pdf": ("BERGEN", "676269e07ceaa773a70d35b4de7eb37fa5ee7177ba0ba288566716b23b093b45"),
    "devbur.pdf": ("BURLINGTON", "ff8ed6c37b62f728420582840a62f54b41bbae58f2b601c01539d5a7cc933bdb"),
    "devcam.pdf": ("CAMDEN", "33a090bafb381b098d860ce70644593456bead758b467b04db5d13257f13db23"),
    "devcap.pdf": ("CAPE MAY", "b1b995579580b5302179c6a447685fdb25370011e84ee38b5a7baa824b7de5d3"),
    "devcum.pdf": ("CUMBERLAND", "59de0b5db8fe7db5247129779ac58b5b877590bf43bf099a8da5cd38983a0605"),
    "devess.pdf": ("ESSEX", "ada1a039a7656fa62abf61d69b623815f2e14efa3158fa4416158dfd13876238"),
    "devglo.pdf": ("GLOUCESTER", "789af10b09d3a0d4c79a4bd650412af24b8def356cfe85452294708686ce1f33"),
    "devhud.pdf": ("HUDSON", "92561e30690019d30f4052b74acd949de938ff04e8e235a96eea63784bf36831"),
    "devhun.pdf": ("HUNTERDON", "324e09d022d85303aed2b0ba2d21186e393589a2a4d2d9111482677b78324e61"),
    "devmer.pdf": ("MERCER", "0cb23551699f936f60dfcb3f3d3dcbc38ebbaf1e2c4a36890ab82241bb9d1fc5"),
    "devmid.pdf": ("MIDDLESEX", "eaee5172e613c009b175de78465fa39b55e48a24cf793b20103d475f898f8cab"),
    "devmon.pdf": ("MONMOUTH", "2350dd032c47637ae5183a193d55404ebde2abddc66ac2c64c48ac4bfc15dcac"),
    "devmor.pdf": ("MORRIS", "c1420ae154179e59ad566b168e08aa30b3dcc433d0340fa3fb058e9f83b630ad"),
    "devoce.pdf": ("OCEAN", "8473fc580f3b3206d9a7d0d03c3d0279f88b679a5acd49822dcdcae2ac8481f2"),
    "devpas.pdf": ("PASSAIC", "d6f3771c23e57f1d8b64cc2e9baf5bc593bb4ed79b87bdf163260bc043db7a39"),
    "devsal.pdf": ("SALEM", "446853eb6d9a05be51c952fbf8c0bded89e526934a6b5cea78c02fc4814dea9b"),
    "devsom.pdf": ("SOMERSET", "384ac4f761b30908c2c6b1171a0050436387786cddc52b169ef551732c1fab6d"),
    "devsus.pdf": ("SUSSEX", "3602e046f1b6ac1d227f0caed0b65602011d509b41f8f42f4f41659a712af760"),
    "devuni.pdf": ("UNION", "f0878e263f29f1b7bc9e3fa4645ead8fc54b2b6a5ff1a22ba4fedf457c5b8687"),
    "devwar.pdf": ("WARREN", "c7947f9e7255ffa9bcd6f5a9839a4152171ebe01a5979b532de0711819a6fb86"),
}

YEARS = (2014, 2015, 2016, 2017)
TARGET_YEARS = (2016, 2017)
LEGAL = {"CITY", "BOROUGH", "TOWNSHIP", "TOWN", "VILLAGE"}

# Explicit one-to-one historical names verified directly in the October 2017
# Division of Taxation county PDFs. These are aliases, never fuzzy matches.
HISTORICAL_ALIASES_BY_CODE = {
    "0212": ("BERGEN", "E RUTHERFORD BOROUGH"),
    "0217": ("BERGEN", "FAIRLAWN BOROUGH"),
    "0225": ("BERGEN", "HASBROUCK HGHTS BOROUGH"),
    "0228": ("BERGEN", "HOHOKUS BOROUGH"),
    "0252": ("BERGEN", "RIVEREDGE BOROUGH"),
    "0253": ("BERGEN", "RIVERVALE TOWNSHIP"),
    "0323": ("BURLINGTON", "MT HOLLY TOWNSHIP"),
    "0324": ("BURLINGTON", "MT LAUREL TOWNSHIP"),
    "0326": ("BURLINGTON", "NO HANOVER TOWNSHIP"),
    "0409": ("CAMDEN", "CHERRY HILL TWNSHP"),
    "1426": ("MORRIS", "MOUNT ARLINGTON BOR"),
    "1429": ("MORRIS", "PARSIPPANY TR HLS TOWNSHIP"),
    "1525": ("OCEAN", "PT PLEASANT BEACH BOROUGH"),
    "1704": ("SALEM", "LOWER ALLOWAY CREEK TOWNSHIP"),
    "1815": ("SOMERSET", "PEAPACK GLADSTONE BOROUGH"),
}


def normalize_name(value: str) -> str:
    s = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().upper()
    s = s.replace("&", " ")
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    repl = {
        "TWP": "TOWNSHIP", "BORO": "BOROUGH", "BO": "BOROUGH",
        "SO": "SOUTH", "RIV": "RIVER", "VILL": "VILLAGE",
    }
    toks = [repl.get(t, t) for t in s.split()]
    if len(toks) >= 2 and toks[-2:] == ["BOROUGH", "TOWNSHIP"]:
        toks = toks[:-1]
    if len(toks) >= 2 and toks[-1] == toks[-2] and toks[-1] in LEGAL:
        toks = toks[:-1]
    return " ".join(toks)


def base_name(value: str) -> str:
    toks = [t for t in normalize_name(value).split() if t not in LEGAL and t != "OF"]
    return " ".join(toks)


def cluster_words(words, tolerance: float = 0.25):
    lines: list[list] = []
    for word in sorted(words, key=lambda z: (z["top"], z["x0"])):
        target = None
        for i in range(len(lines) - 1, max(-1, len(lines) - 4), -1):
            if abs(word["top"] - lines[i][0]) <= tolerance:
                target = i
                break
        if target is None:
            lines.append([word["top"], [word]])
        else:
            lines[target][1].append(word)
            lines[target][0] = sum(x["top"] for x in lines[target][1]) / len(lines[target][1])
    return [(top, sorted(ws, key=lambda z: z["x0"])) for top, ws in sorted(lines, key=lambda q: q[0])]


def detect_columns(page):
    for _top, words in cluster_words(page.extract_words(x_tolerance=1, y_tolerance=2)):
        nums = [w for w in words if w["text"] in {"1", "2", "4"} and 250 <= w["x0"] <= 680]
        nums = sorted(nums, key=lambda w: w["x0"])
        if len(nums) >= 9 and [w["text"] for w in nums[:9]] == ["1", "2", "4"] * 3:
            nums = nums[:9]
            centers = [(w["x0"] + w["x1"]) / 2 for w in nums]

            def bounds(index: int):
                return ((centers[index - 1] + centers[index]) / 2,
                        (centers[index] + centers[index + 1]) / 2)

            return {"segmented_class2": bounds(4), "sales_class2": bounds(7)}
    raise RuntimeError("Could not locate COD table column headers")


def numeric_cell(words, bounds, integer=False):
    values = []
    for word in words:
        center = (word["x0"] + word["x1"]) / 2
        if bounds[0] <= center < bounds[1] and re.fullmatch(r"\d+(?:\.\d+)?", word["text"]):
            values.append(word["text"])
    if not values:
        return 0 if integer else None
    if len(values) != 1:
        raise RuntimeError(f"Ambiguous COD cell {bounds}: {values}")
    return int(values[0]) if integer else float(values[0])


def download_and_parse(tmp: Path):
    source_rows = []
    for filename, (county, expected_hash) in SOURCES.items():
        path = tmp / filename
        request = urllib.request.Request(BASE_URL + filename, headers={"User-Agent": "WatchdogSourceBuild/1.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            path.write_bytes(response.read())
        got_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        if got_hash != expected_hash:
            raise RuntimeError(f"Source hash mismatch for {filename}: {got_hash} != {expected_hash}")

        current = None
        entries = []
        with pdfplumber.open(path) as pdf:
            columns = detect_columns(pdf.pages[0])
            for page_number, page in enumerate(pdf.pages, 1):
                words = page.extract_words(x_tolerance=1, y_tolerance=2, keep_blank_chars=False)
                for _top, row_words in cluster_words(words):
                    year_words = [w for w in row_words if re.fullmatch(r"201[4-7]", w["text"]) and 180 <= w["x0"] < 250]
                    if not year_words:
                        continue
                    if len(year_words) != 1:
                        raise RuntimeError(f"Ambiguous year row in {filename} page {page_number}")
                    year = int(year_words[0]["text"])
                    year_x = year_words[0]["x0"]
                    source_name = " ".join(w["text"] for w in row_words if w["x1"] < year_x - 8).strip()
                    if source_name:
                        current = {
                            "county": county,
                            "source_name": source_name,
                            "normalized_name": normalize_name(source_name),
                            "source_file": filename,
                            "source_page": page_number,
                            "rows": {},
                        }
                        entries.append(current)
                    if current is None:
                        raise RuntimeError(f"Continuation row without municipality in {filename}")
                    if year in current["rows"]:
                        raise RuntimeError(f"Duplicate {year} row for {county} / {current['source_name']}")
                    printed_cod = numeric_cell(row_words, columns["segmented_class2"])
                    class2_sales = numeric_cell(row_words, columns["sales_class2"], integer=True)
                    canonical_cod = None if printed_cod is None or (printed_cod == 0.0 and class2_sales == 0) else printed_cod
                    current["rows"][year] = {
                        "cod": canonical_cod,
                        "printed_cod": printed_cod,
                        "class_2_sales": class2_sales,
                    }
        for entry in entries:
            if set(entry["rows"]) != set(YEARS):
                raise RuntimeError(f"Incomplete source history for {county} / {entry['source_name']}")
            source_rows.append(entry)

    if len(source_rows) != 565:
        raise RuntimeError(f"Expected 565 historical source municipalities, found {len(source_rows)}")
    keys = [(r["county"], r["normalized_name"]) for r in source_rows]
    duplicates = [key for key, count in Counter(keys).items() if count != 1]
    if duplicates:
        raise RuntimeError(f"Duplicate normalized source identities: {duplicates}")

    pine = [r for r in source_rows if r["county"] == "CAMDEN" and r["normalized_name"] == "PINE VALLEY BOROUGH"]
    if len(pine) != 1 or any(pine[0]["rows"][year]["cod"] is not None or pine[0]["rows"][year]["class_2_sales"] != 0 for year in YEARS):
        raise RuntimeError("Retired Pine Valley source identity is not the expected all-blank record")
    return source_rows


def reconcile(source_rows):
    manifest = json.loads(TOWNS.read_text())
    pages = manifest.get("pages", [])
    if manifest.get("total_towns") != 564 or len(pages) != 564:
        raise RuntimeError(f"Current identity plane is not 564 districts: {manifest.get('total_towns')} / {len(pages)}")

    source_exact = {(r["county"], r["normalized_name"]): r for r in source_rows}
    assigned_source_ids = set()
    matches = {}
    unresolved = []

    for town in pages:
        code = str(town["district"]).zfill(4)
        county = str(town["county"]).upper()
        key = (county, normalize_name(str(town["name"])))
        alias_key = HISTORICAL_ALIASES_BY_CODE.get(code)
        if alias_key is not None:
            if alias_key[0] != county:
                raise RuntimeError(f"Historical alias county mismatch for {code}: {alias_key[0]} != {county}")
            source = source_exact.get(alias_key)
            if source is None:
                raise RuntimeError(f"Verified historical alias target missing for {code}: {alias_key}")
        else:
            source = source_exact.get(key)
        if source is None:
            unresolved.append((code, town, key))
            continue
        matches[code] = source
        assigned_source_ids.add((source["county"], source["normalized_name"]))

    if unresolved:
        source_by_base = defaultdict(list)
        current_by_base = defaultdict(list)
        for source in source_rows:
            sid = (source["county"], source["normalized_name"])
            if sid not in assigned_source_ids:
                source_by_base[(source["county"], base_name(source["source_name"]))].append(source)
        for code, town, _key in unresolved:
            current_by_base[(str(town["county"]).upper(), base_name(str(town["name"])))].append((code, town))

        still = []
        for code, town, _key in unresolved:
            bkey = (str(town["county"]).upper(), base_name(str(town["name"])))
            candidates = source_by_base.get(bkey, [])
            current_peers = current_by_base.get(bkey, [])
            if len(candidates) == 1 and len(current_peers) == 1:
                source = candidates[0]
                matches[code] = source
                assigned_source_ids.add((source["county"], source["normalized_name"]))
            else:
                still.append((code, town["county"], town["name"], bkey, [c["source_name"] for c in candidates]))
        unresolved = still

    unmatched_sources = [r for r in source_rows if (r["county"], r["normalized_name"]) not in assigned_source_ids]
    allowed_unmatched = [(r["county"], r["normalized_name"]) for r in unmatched_sources]
    if unresolved:
        raise RuntimeError(f"Unmatched current identities: {unresolved}")
    if len(matches) != 564:
        raise RuntimeError(f"Expected 564 current matches, found {len(matches)}")
    if allowed_unmatched != [("CAMDEN", "PINE VALLEY BOROUGH")]:
        raise RuntimeError(f"Unexpected unmatched historical identities: {allowed_unmatched}")
    if len(set(id(v) for v in matches.values())) != 564:
        raise RuntimeError("Historical source identity was assigned to multiple current districts")
    return pages, matches


def build_artifact(source_rows, pages, matches):
    districts = {}
    for town in pages:
        code = str(town["district"]).zfill(4)
        source = matches[code]
        districts[code] = {
            "name": str(town["name"]),
            "county": str(town["county"]).upper(),
            "source_name": source["source_name"],
            "source_file": source["source_file"],
            "series": {str(year): source["rows"][year]["cod"] for year in TARGET_YEARS},
            "class_2_sales": {str(year): source["rows"][year]["class_2_sales"] for year in TARGET_YEARS},
        }

    coverage = {
        str(year): {
            "current_districts": 564,
            "published_non_null_cod": sum(row["series"][str(year)] is not None for row in districts.values()),
            "missing_cod": sum(row["series"][str(year)] is None for row in districts.values()),
            "positive_class_2_sales": sum(row["class_2_sales"][str(year)] > 0 for row in districts.values()),
            "published_real_zero_with_sales": sum(row["series"][str(year)] == 0 and row["class_2_sales"][str(year)] > 0 for row in districts.values()),
        }
        for year in TARGET_YEARS
    }

    artifact = {
        "schema_version": 1,
        "source_id": "nj-division-taxation-cod-2017-county-tables",
        "source_agency": "State of New Jersey Department of the Treasury, Division of Taxation",
        "source_title": "Measures of Property Assessment Uniformity in New Jersey Taxing Districts - Coefficients of Deviation",
        "source_edition": "2017 county tables covering 2014-2017",
        "source_urls": {filename: BASE_URL + filename for filename in SOURCES},
        "source_sha256": {filename: digest for filename, (_county, digest) in SOURCES.items()},
        "metric": "segmented_class_2_cod",
        "years": [2016, 2017],
        "source_municipality_count": 565,
        "current_district_count": 564,
        "retired_source_identity": "PINE VALLEY BOROUGH / CAMDEN",
        "missing_value_policy": "Blank COD remains null; printed 0.00 with zero Class 2 sales is null; printed 0.00 with positive Class 2 sales is preserved as zero.",
        "coverage": coverage,
        "districts": dict(sorted(districts.items())),
    }

    if artifact["districts"]["0101"]["series"] != {"2016": 14.02, "2017": 14.45}:
        raise RuntimeError(f"Absecon control mismatch: {artifact['districts']['0101']['series']}")
    if artifact["districts"]["0419"]["series"] != {"2016": None, "2017": 0.0}:
        raise RuntimeError(f"Hi-Nella null/real-zero control mismatch: {artifact['districts']['0419']['series']}")
    if artifact["districts"]["0419"]["class_2_sales"] != {"2016": 1, "2017": 1}:
        raise RuntimeError(f"Hi-Nella sales control mismatch: {artifact['districts']['0419']['class_2_sales']}")

    OUT.write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n")
    return artifact


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if new in source:
        return source
    if source.count(old) != 1:
        raise RuntimeError(f"{label}: expected one replacement target, found {source.count(old)}")
    return source.replace(old, new, 1)


def patch_runtime():
    source = HYDRATE.read_text()
    old_urls = "const URLS={registry:BASE+'/property/data/marker-registry.json',sr1a:BASE+'/property/sr1a-ratios.json',uniformity:BASE+'/property/uniformity.json',codHistory:BASE+'/property/data/cod/historical-cod-2018-2021.json',appeals:BASE+'/property/appeals.json',budget:BASE+'/property/data/budget-pressure.json'};"
    new_urls = "const URLS={registry:BASE+'/property/data/marker-registry.json',sr1a:BASE+'/property/sr1a-ratios.json',uniformity:BASE+'/property/uniformity.json',codHistory:BASE+'/property/data/cod/historical-cod-2018-2021.json',codLegacy:BASE+'/property/data/cod/historical-cod-2016-2017.json',appeals:BASE+'/property/appeals.json',budget:BASE+'/property/data/budget-pressure.json'};"
    source = replace_once(source, old_urls, new_urls, "legacy COD URL")

    old_value = "function uniformityValue(row:any,field:string,historical:any=null){const f=String(field||''),m=f.match(/^cod_(\\d{4})$/);if(m)return row?.series?.[m[1]]??historical?.series?.[m[1]]??null;"
    new_value = "function uniformityValue(row:any,field:string,historical:any=null,legacy:any=null){const f=String(field||''),m=f.match(/^cod_(\\d{4})$/);if(m)return row?.series?.[m[1]]??historical?.series?.[m[1]]??legacy?.series?.[m[1]]??null;"
    source = replace_once(source, old_value, new_value, "legacy uniformity lookup")

    old_family = "if(src==='nj-cod'){const code=String(r.pams_pin||'').slice(0,4),row=root.uniformity?.districts?.[code],historical=root.codHistory?.districts?.[code],derived=field==='volatility';return{v:uniformityValue(row,field,historical),kind:derived?'derived_governed':'authoritative_reference',source:derived?'Watchdog population standard deviation over NJ Division of Taxation segmented Class 2 COD series':'NJ Division of Taxation assessment uniformity'}}"
    new_family = "if(src==='nj-cod'){const code=String(r.pams_pin||'').slice(0,4),row=root.uniformity?.districts?.[code],historical=root.codHistory?.districts?.[code],legacy=root.codLegacy?.districts?.[code],derived=field==='volatility';return{v:uniformityValue(row,field,historical,legacy),kind:derived?'derived_governed':'authoritative_reference',source:derived?'Watchdog population standard deviation over NJ Division of Taxation segmented Class 2 COD series':'NJ Division of Taxation assessment uniformity'}}"
    source = replace_once(source, old_family, new_family, "legacy COD family")
    HYDRATE.write_text(source)


def patch_canary():
    source = CANARY.read_text()
    if "uniformity_history_v3:" in source:
        return
    scenario = """  uniformity_history_v3:{fn:'workbench-hydrate',body:{pams_pins:['0101_25.01_10'],marker_ids:['uniformity.cod_2016','uniformity.cod_2017','uniformity.cod_2018','uniformity.cod_2022']},expect_available:[{pin:'0101_25.01_10',marker_ids:['uniformity.cod_2016','uniformity.cod_2017','uniformity.cod_2018','uniformity.cod_2022']}],expect_values:[{pin:'0101_25.01_10',values:{'uniformity.cod_2016':14.02,'uniformity.cod_2017':14.45,'uniformity.cod_2018':12.81,'uniformity.cod_2022':18.09}}],expect_provider_kinds:[{pin:'0101_25.01_10',kinds:{'uniformity.cod_2016':'authoritative_reference','uniformity.cod_2017':'authoritative_reference','uniformity.cod_2018':'authoritative_reference','uniformity.cod_2022':'authoritative_reference'}}],expect_sources:[{pin:'0101_25.01_10',sources:{'uniformity.cod_2016':'NJ Division of Taxation assessment uniformity','uniformity.cod_2017':'NJ Division of Taxation assessment uniformity','uniformity.cod_2018':'NJ Division of Taxation assessment uniformity','uniformity.cod_2022':'NJ Division of Taxation assessment uniformity'}}]}"""
    needle = "\n};\nfunction cors"
    if source.count(needle) != 1:
        raise RuntimeError(f"Canary insertion point count {source.count(needle)}")
    source = source.replace(needle, ",\n" + scenario + "\n};\nfunction cors", 1)
    CANARY.write_text(source)


def patch_manifest(artifact):
    text = MANIFEST.read_text()
    tag = "## October 2017 county-table recovery for 2016-2017"
    if tag in text:
        return
    lines = [
        "", "", tag, "",
        "- Official publisher: State of New Jersey, Department of the Treasury, Division of Taxation.",
        "- Publication family: **Measures of Property Assessment Uniformity in New Jersey Taxing Districts - Coefficients of Deviation**.",
        "- Source edition: 21 official county PDFs created October 2017 and covering 2014-2017.",
        "- Canonical Watchdog metric: **Segmented by Class / Property Class 2 (Residential) coefficient of deviation**.",
        "- Historical source plane: 565 municipality records. Current Watchdog identity plane: 564 districts.",
        "- The sole retired historical identity is Pine Valley Borough, Camden County. Its 2014-2017 table is entirely blank, so it is excluded rather than merged into a current municipality.",
        "- Missing rule: blank COD remains null. Printed `0.00` with zero Class 2 sales is null; printed `0.00` with positive Class 2 sales is preserved as an actual zero.",
        f"- 2016 current-district coverage: {artifact['coverage']['2016']['published_non_null_cod']} published COD values / 564 districts; {artifact['coverage']['2016']['missing_cod']} source-missing.",
        f"- 2017 current-district coverage: {artifact['coverage']['2017']['published_non_null_cod']} published COD values / 564 districts; {artifact['coverage']['2017']['missing_cod']} source-missing.",
        "- Absecon City (`0101`) control: 2016 `14.02`, 2017 `14.45`.",
        "- Hi-Nella Borough (`0419`) source-semantics control: 2016 is blank with one Class 2 sale and remains null; 2017 is printed `0.00` with one Class 2 sale and remains the real value `0.00`.",
        "- The legacy 2016-2017 artifact is separate from both the January 2022 historical artifact and the current 2022-2025 series. `uniformity.volatility` therefore keeps its already-certified current-period formula semantics.",
        "", "Source-file SHA-256:", "",
    ]
    for filename, (_county, digest) in SOURCES.items():
        lines.append(f"- `{filename}`: `{digest}`")
    MANIFEST.write_text(text.rstrip() + "\n" + "\n".join(lines) + "\n")


def main():
    if not TOWNS.exists():
        raise RuntimeError("Current town manifest is missing")
    with tempfile.TemporaryDirectory(prefix="watchdog-cod-2017-") as tmpdir:
        source_rows = download_and_parse(Path(tmpdir))
    pages, matches = reconcile(source_rows)
    artifact = build_artifact(source_rows, pages, matches)
    patch_runtime()
    patch_canary()
    patch_manifest(artifact)
    print(json.dumps({
        "status": "pass",
        "source_municipalities": 565,
        "current_districts": 564,
        "coverage": artifact["coverage"],
        "absecon": artifact["districts"]["0101"]["series"],
        "hi_nella": {"series": artifact["districts"]["0419"]["series"], "sales": artifact["districts"]["0419"]["class_2_sales"]},
        "retired_source_identity": artifact["retired_source_identity"],
    }, indent=2))


if __name__ == "__main__":
    main()
