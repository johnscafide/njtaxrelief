#!/usr/bin/env python3
"""Activate governed January 2022 NJ COD history without changing current-score semantics.

This consumes the compact governed extraction from the official NJ Division of
Taxation January 2022 statewide Coefficients of Deviation report.

Safety:
- 2018-2021 are stored under `historical_series`, not `series`, so the already-
  certified 2022-2025 volatility calculation remains unchanged.
- workbench-hydrate receives exactly one fallback: cod_YYYY may read
  historical_series when current series has no year.
- provider-release-canary gets a new v2 scenario; v1 is preserved.
- no weights, thresholds, interpolation, or synthetic values are introduced.
"""
from __future__ import annotations
import base64
import hashlib
import json
import zlib
from pathlib import Path

HIST = Path("property/data/cod/historical-cod-2018-2021.json")
PAYLOAD = Path("property/data/cod/historical-cod-2018-2021.zlib.b64")
TOWNS = Path("towns/town-manifest.json")
UNIFORMITY = Path("property/uniformity.json")
HYDRATE = Path("supabase/functions/workbench-hydrate/index.ts")
CANARY = Path("supabase/functions/provider-release-canary/index-v2.ts")
MANIFEST = Path("property/data/cod/SOURCE-MANIFEST.md")

SOURCE_PDF_SHA256 = "b1be9418d34c111c81bdc14352053b63d049a4420659f47aa4ba94ead457ee52"
PAYLOAD_SHA256 = "391db30dd89a8f53e45ed0b8a1920920dd42bd5a77d118d6dae7e4cd2e93dc1f"
PLAIN_SHA256 = "d8a82a959452347bcb28f556da59bf277d5710ddbb643d526dc8286763e48e85"
EXPECTED_YEARS = ["2018","2019","2020","2021"]
EXPECTED_ABSECON = {"2018":12.81,"2019":12.89,"2020":11.46,"2021":12.51}


def build_hist() -> dict:
    encoded=PAYLOAD.read_text(encoding="utf-8").strip()
    assert hashlib.sha256(encoded.encode()).hexdigest()==PAYLOAD_SHA256
    plain=zlib.decompress(base64.b64decode(encoded)).decode("utf-8")
    assert hashlib.sha256(plain.encode()).hexdigest()==PLAIN_SHA256

    town_root=json.loads(TOWNS.read_text(encoding="utf-8"))
    pages=town_root.get("pages",[])
    assert town_root.get("total_towns")==564
    assert len(pages)==564
    towns={str(r["district"]).zfill(4):r for r in pages}
    assert len(towns)==564

    districts={}
    for line in plain.splitlines():
        code,payload=line.split("|",1)
        vals=payload.split(",")
        assert len(vals)==8, (code,vals)
        meta=towns[code]
        series={}
        sales={}
        for i,year in enumerate(EXPECTED_YEARS):
            raw_v=vals[i*2]
            count=int(vals[i*2+1])
            # The January 2022 publication prints 0.00 for both a mathematical
            # zero and for no Class-2 observations.  Sales count disambiguates.
            v=None if count==0 else float(raw_v)
            series[year]=v
            sales[year]=count
        districts[code]={
            "name":str(meta["name"]).upper(),
            "county":str(meta["county"]).upper(),
            "series":series,
            "class_2_sales":sales,
        }
    assert len(districts)==564

    hist={
        "schema_version":1,
        "source_id":"nj-division-taxation-cod-2021-data-jan-2022",
        "source_agency":"State of New Jersey Department of the Treasury, Division of Taxation",
        "source_title":"Coefficients of Deviation - A Measure of Property Assessment Uniformity - 2021 Data",
        "source_updated":"2022-01",
        "source_sha256":SOURCE_PDF_SHA256,
        "source_pages":58,
        "metric":"segmented_class_2_cod",
        "years":[2018,2019,2020,2021],
        "district_count":564,
        "district_year_count":2256,
        "districts":districts,
    }
    HIST.write_text(json.dumps(hist,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    return hist


def main():
    hist=build_hist()
    assert hist["metric"]=="segmented_class_2_cod"
    assert hist["source_sha256"]==SOURCE_PDF_SHA256
    assert hist["district_count"]==564
    assert hist["district_year_count"]==2256
    assert sorted(map(str,hist["years"]))==EXPECTED_YEARS
    assert hist["districts"]["0101"]["series"]==EXPECTED_ABSECON
    assert len(hist["districts"])==564
    for code,row in hist["districts"].items():
        assert len(code)==4 and code.isdigit()
        assert sorted(row["series"])==EXPECTED_YEARS
        assert sorted(row["class_2_sales"])==EXPECTED_YEARS

    root=json.loads(UNIFORMITY.read_text(encoding="utf-8"))
    districts=root.setdefault("districts",{})
    before=len(districts)
    for code,hrow in hist["districts"].items():
        row=districts.get(code)
        if row is None:
            row={
                "score":None,"coefficient":None,"band":"unavailable",
                "latest":None,"latest_year":None,"volatility":None,"sales":0,
                "years":[],"series":{},"general":None,"commercial":None,
                "vacant":None,"name":hrow["name"].title(),
                "county":hrow["county"],"percentile":None
            }
            districts[code]=row
        row["historical_series"]=hrow["series"]
        row["historical_class_2_sales"]=hrow["class_2_sales"]
    assert len(districts)==564, (before,len(districts))

    # Certified current-period calculations remain current-period only.
    absecon=districts["0101"]
    assert absecon["series"]=={"2022":18.09,"2023":18.94,"2024":16.28,"2025":16.71}
    assert absecon["volatility"]==1.06
    assert absecon["historical_series"]==EXPECTED_ABSECON
    UNIFORMITY.write_text(json.dumps(root,indent=1,ensure_ascii=False)+"\n",encoding="utf-8")

    source=HYDRATE.read_text(encoding="utf-8")
    old="if(m)return row.series?.[m[1]]??null;if(f==='volatility')"
    new="if(m)return row.series?.[m[1]]??row.historical_series?.[m[1]]??null;if(f==='volatility')"
    if old in source:
        assert source.count(old)==1
        source=source.replace(old,new,1)
    else:
        assert new in source, "workbench-hydrate uniformity fallback target not found"
    HYDRATE.write_text(source,encoding="utf-8")

    canary=CANARY.read_text(encoding="utf-8")
    scenario="""  uniformity_history_v2:{fn:'workbench-hydrate',body:{pams_pins:['0101_25.01_10'],marker_ids:['uniformity.cod_2018','uniformity.cod_2019','uniformity.cod_2020','uniformity.cod_2021','uniformity.cod_2022','uniformity.cod_2016']},expect_available:[{pin:'0101_25.01_10',marker_ids:['uniformity.cod_2018','uniformity.cod_2019','uniformity.cod_2020','uniformity.cod_2021','uniformity.cod_2022']}],expect_missing:[{pin:'0101_25.01_10',marker_ids:['uniformity.cod_2016'],status:'source_checked_no_value'}],expect_values:[{pin:'0101_25.01_10',values:{'uniformity.cod_2018':12.81,'uniformity.cod_2019':12.89,'uniformity.cod_2020':11.46,'uniformity.cod_2021':12.51,'uniformity.cod_2022':18.09}}],expect_provider_kinds:[{pin:'0101_25.01_10',kinds:{'uniformity.cod_2018':'authoritative_reference','uniformity.cod_2019':'authoritative_reference','uniformity.cod_2020':'authoritative_reference','uniformity.cod_2021':'authoritative_reference','uniformity.cod_2022':'authoritative_reference','uniformity.cod_2016':'authoritative_reference'}}],expect_sources:[{pin:'0101_25.01_10',sources:{'uniformity.cod_2018':'NJ Division of Taxation assessment uniformity','uniformity.cod_2019':'NJ Division of Taxation assessment uniformity','uniformity.cod_2020':'NJ Division of Taxation assessment uniformity','uniformity.cod_2021':'NJ Division of Taxation assessment uniformity','uniformity.cod_2022':'NJ Division of Taxation assessment uniformity','uniformity.cod_2016':'NJ Division of Taxation assessment uniformity'}}]}"""
    if "uniformity_history_v2:" not in canary:
        needle="\n};\nfunction cors"
        assert canary.count(needle)==1, "provider canary SCENARIOS terminator not found uniquely"
        canary=canary.replace(needle,",\n"+scenario+"\n};\nfunction cors",1)
    CANARY.write_text(canary,encoding="utf-8")

    manifest=MANIFEST.read_text(encoding="utf-8")
    tag="## January 2022 statewide historical recovery"
    if tag not in manifest:
        manifest += f"""

{tag}

- Official publication: State of New Jersey, Department of the Treasury, Division of Taxation, **Coefficients of Deviation - A Measure of Property Assessment Uniformity - 2021 Data**, updated January 2022.
- Preserved source PDF SHA-256: `{SOURCE_PDF_SHA256}`.
- PDF metadata: 58 pages; title `2021 Coefficients of Deviation`; NJ Division of Taxation author; created 2022-01-27.
- Statewide contract: 564 four-digit C/D districts x 4 years (2018-2021) = 2,256 district-year rows.
- Canonical metric: **Segmented by Class / Property Class 2** coefficient of deviation.
- `0.00` is stored as null only when the official Class 2 sales count is zero. A published `0.00` with one or more Class 2 sales is preserved as a real zero.
- Absecon City (`0101`) control: 2018 `12.81`, 2019 `12.89`, 2020 `11.46`, 2021 `12.51`.
- Historical years are stored separately from the current 2022-2025 `series` so the already-certified current-period volatility marker does not silently change formula semantics.
"""
        MANIFEST.write_text(manifest,encoding="utf-8")

    print(json.dumps({
        "status":"pass","historical_districts":564,
        "historical_district_years":2256,
        "uniformity_districts":len(districts),
        "absecon_historical":EXPECTED_ABSECON
    },indent=2))

if __name__=="__main__":
    main()
