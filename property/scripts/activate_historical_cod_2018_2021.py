#!/usr/bin/env python3
"""Activate governed January 2022 NJ COD history without changing current-score semantics."""
from __future__ import annotations
import base64, hashlib, json, zlib
from pathlib import Path

HIST=Path("property/data/cod/historical-cod-2018-2021.json")
PAYLOAD=Path("property/data/cod/historical-cod-2018-2021.zlib.b64")
TOWNS=Path("towns/town-manifest.json")
HYDRATE=Path("supabase/functions/workbench-hydrate/index.ts")
CANARY=Path("supabase/functions/provider-release-canary/index-v2.ts")
MANIFEST=Path("property/data/cod/SOURCE-MANIFEST.md")
SOURCE_PDF_SHA256="b1be9418d34c111c81bdc14352053b63d049a4420659f47aa4ba94ead457ee52"
PAYLOAD_SHA256="391db30dd89a8f53e45ed0b8a1920920dd42bd5a77d118d6dae7e4cd2e93dc1f"
PLAIN_SHA256="d8a82a959452347bcb28f556da59bf277d5710ddbb643d526dc8286763e48e85"
YEARS=["2018","2019","2020","2021"]
ABSECON={"2018":12.81,"2019":12.89,"2020":11.46,"2021":12.51}

def build_hist():
    encoded=PAYLOAD.read_text().strip(); assert hashlib.sha256(encoded.encode()).hexdigest()==PAYLOAD_SHA256
    plain=zlib.decompress(base64.b64decode(encoded)).decode(); assert hashlib.sha256(plain.encode()).hexdigest()==PLAIN_SHA256
    tr=json.loads(TOWNS.read_text()); pages=tr.get("pages",[]); assert tr.get("total_towns")==564 and len(pages)==564
    towns={str(r["district"]).zfill(4):r for r in pages}; assert len(towns)==564
    districts={}
    for line in plain.splitlines():
        code,p=line.split("|",1); vals=p.split(","); assert len(vals)==8
        series={}; sales={}
        for i,y in enumerate(YEARS):
            count=int(vals[i*2+1]); raw=vals[i*2]
            series[y]=None if count==0 else float(raw); sales[y]=count
        meta=towns[code]
        districts[code]={"name":str(meta["name"]).upper(),"county":str(meta["county"]).upper(),"series":series,"class_2_sales":sales}
    assert len(districts)==564
    hist={"schema_version":1,"source_id":"nj-division-taxation-cod-2021-data-jan-2022","source_agency":"State of New Jersey Department of the Treasury, Division of Taxation","source_title":"Coefficients of Deviation - A Measure of Property Assessment Uniformity - 2021 Data","source_updated":"2022-01","source_sha256":SOURCE_PDF_SHA256,"source_pages":58,"metric":"segmented_class_2_cod","years":[2018,2019,2020,2021],"district_count":564,"district_year_count":2256,"districts":districts}
    assert hist["districts"]["0101"]["series"]==ABSECON
    HIST.write_text(json.dumps(hist,indent=2,sort_keys=True)+"\n")
    return hist

def replace_once(source, candidates, new, label):
    for old in candidates:
        if old in source:
            assert source.count(old)==1, label
            return source.replace(old,new,1)
    assert new in source, f"{label} target not found"
    return source

def main():
    hist=build_hist(); assert hist["district_count"]==564 and hist["district_year_count"]==2256

    source=HYDRATE.read_text()
    old_urls="const URLS={registry:BASE+'/property/data/marker-registry.json',sr1a:BASE+'/property/sr1a-ratios.json',uniformity:BASE+'/property/uniformity.json',appeals:BASE+'/property/appeals.json',budget:BASE+'/property/data/budget-pressure.json'};"
    new_urls="const URLS={registry:BASE+'/property/data/marker-registry.json',sr1a:BASE+'/property/sr1a-ratios.json',uniformity:BASE+'/property/uniformity.json',codHistory:BASE+'/property/data/cod/historical-cod-2018-2021.json',appeals:BASE+'/property/appeals.json',budget:BASE+'/property/data/budget-pressure.json'};"
    source=replace_once(source,[old_urls],new_urls,"COD history URL")
    old_value_a="function uniformityValue(row:any,field:string){if(!row)return null;const f=String(field||''),m=f.match(/^cod_(\\d{4})$/);if(m)return row.series?.[m[1]]??null;if(f==='volatility')"
    old_value_b="function uniformityValue(row:any,field:string){if(!row)return null;const f=String(field||''),m=f.match(/^cod_(\\d{4})$/);if(m)return row.series?.[m[1]]??row.historical_series?.[m[1]]??null;if(f==='volatility')"
    new_value="function uniformityValue(row:any,field:string,historical:any=null){const f=String(field||''),m=f.match(/^cod_(\\d{4})$/);if(m)return row?.series?.[m[1]]??historical?.series?.[m[1]]??null;if(!row)return null;if(f==='volatility')"
    source=replace_once(source,[old_value_a,old_value_b],new_value,"uniformity value")
    old_family="if(src==='nj-cod'){const row=root.uniformity?.districts?.[String(r.pams_pin||'').slice(0,4)],derived=field==='volatility';return{v:uniformityValue(row,field),kind:derived?'derived_governed':'authoritative_reference',source:derived?'Watchdog population standard deviation over NJ Division of Taxation segmented Class 2 COD series':'NJ Division of Taxation assessment uniformity'}}"
    new_family="if(src==='nj-cod'){const code=String(r.pams_pin||'').slice(0,4),row=root.uniformity?.districts?.[code],historical=root.codHistory?.districts?.[code],derived=field==='volatility';return{v:uniformityValue(row,field,historical),kind:derived?'derived_governed':'authoritative_reference',source:derived?'Watchdog population standard deviation over NJ Division of Taxation segmented Class 2 COD series':'NJ Division of Taxation assessment uniformity'}}"
    source=replace_once(source,[old_family],new_family,"COD family")
    assert "historical_series" not in source
    HYDRATE.write_text(source)

    canary=CANARY.read_text()
    scenario="""  uniformity_history_v2:{fn:'workbench-hydrate',body:{pams_pins:['0101_25.01_10'],marker_ids:['uniformity.cod_2018','uniformity.cod_2019','uniformity.cod_2020','uniformity.cod_2021','uniformity.cod_2022','uniformity.cod_2016']},expect_available:[{pin:'0101_25.01_10',marker_ids:['uniformity.cod_2018','uniformity.cod_2019','uniformity.cod_2020','uniformity.cod_2021','uniformity.cod_2022']}],expect_missing:[{pin:'0101_25.01_10',marker_ids:['uniformity.cod_2016'],status:'source_checked_no_value'}],expect_values:[{pin:'0101_25.01_10',values:{'uniformity.cod_2018':12.81,'uniformity.cod_2019':12.89,'uniformity.cod_2020':11.46,'uniformity.cod_2021':12.51,'uniformity.cod_2022':18.09}}],expect_provider_kinds:[{pin:'0101_25.01_10',kinds:{'uniformity.cod_2018':'authoritative_reference','uniformity.cod_2019':'authoritative_reference','uniformity.cod_2020':'authoritative_reference','uniformity.cod_2021':'authoritative_reference','uniformity.cod_2022':'authoritative_reference','uniformity.cod_2016':'authoritative_reference'}}],expect_sources:[{pin:'0101_25.01_10',sources:{'uniformity.cod_2018':'NJ Division of Taxation assessment uniformity','uniformity.cod_2019':'NJ Division of Taxation assessment uniformity','uniformity.cod_2020':'NJ Division of Taxation assessment uniformity','uniformity.cod_2021':'NJ Division of Taxation assessment uniformity','uniformity.cod_2022':'NJ Division of Taxation assessment uniformity','uniformity.cod_2016':'NJ Division of Taxation assessment uniformity'}}]}"""
    if "uniformity_history_v2:" not in canary:
        needle="\n};\nfunction cors"; assert canary.count(needle)==1
        canary=canary.replace(needle,",\n"+scenario+"\n};\nfunction cors",1)
    CANARY.write_text(canary)

    manifest=MANIFEST.read_text(); tag="## January 2022 statewide historical recovery"
    if tag not in manifest:
        manifest += f"""\n\n{tag}\n\n- Official publication: State of New Jersey, Department of the Treasury, Division of Taxation, **Coefficients of Deviation - A Measure of Property Assessment Uniformity - 2021 Data**, updated January 2022.\n- Preserved source PDF SHA-256: `{SOURCE_PDF_SHA256}`.\n- PDF metadata: 58 pages; title `2021 Coefficients of Deviation`; NJ Division of Taxation author; created 2022-01-27.\n- Statewide contract: 564 four-digit C/D districts x 4 years (2018-2021) = 2,256 district-year rows.\n- Canonical metric: **Segmented by Class / Property Class 2** coefficient of deviation.\n- `0.00` is stored as null only when the official Class 2 sales count is zero. A published `0.00` with one or more Class 2 sales is preserved as a real zero.\n- Absecon City (`0101`) control: 2018 `12.81`, 2019 `12.89`, 2020 `11.46`, 2021 `12.51`.\n- Historical data is a separate runtime artifact. The current 2022-2025 uniformity series and certified volatility semantics remain byte-stable.\n"""
        MANIFEST.write_text(manifest)
    print(json.dumps({"status":"pass","districts":564,"district_years":2256,"absecon":ABSECON},indent=2))

if __name__=="__main__": main()
