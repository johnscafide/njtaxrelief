#!/usr/bin/env python3
"""Server-side Watchdog connector for NJGIN's current statewide parcel service.

Only an explicit public-property allow-list is requested. Owner and owner-mailing
fields exposed by the upstream schema are deliberately excluded.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request


SERVICE = "https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0"
ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_STATUS = ROOT / "property/data/data-factory-status.json"
SAFE_FIELDS = [
    "OBJECTID", "PAMS_PIN", "PCL_MUN", "PCLBLOCK", "PCLLOT", "PCLQCODE",
    "PCLLASTUPD", "PIN_NODUP", "GIS_PIN", "CD_CODE", "PROP_CLASS", "COUNTY",
    "MUN_NAME", "PROP_LOC", "LAND_VAL", "IMPRVT_VAL", "NET_VALUE", "LAST_YR_TX",
    "BLDG_DESC", "LAND_DESC", "CALC_ACRE", "ADD_LOTS1", "ADD_LOTS2", "PROP_USE",
    "BLDG_CLASS", "DEED_BOOK", "DEED_PAGE", "DEED_DATE", "YR_CONSTR", "SALES_CODE",
    "SALE_PRICE", "DWELL", "COMM_DWELL", "OLD_PROPID", "PCL_PBDATE", "PCL_GUID",
    "Shape__Area", "Shape__Length"
]
FORBIDDEN_UPSTREAM_FIELDS = {"OWNER_NAME", "ST_ADDRESS", "CITY_STATE", "ZIP_CODE", "ZIP5", "ZIP_PLUS4"}
KEY_RE = re.compile(r"^[A-Za-z0-9 ._\-/]+$")


def request_json(url: str, params: dict | None = None) -> dict:
    if params:
        url += "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "Watchdog-Data-Factory/1.0 (+https://njpropertytaxrelief.com/property/)"})
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = json.loads(response.read())
    if "error" in payload:
        raise RuntimeError(payload["error"])
    return payload


def health() -> dict:
    metadata = request_json(SERVICE, {"f": "json"})
    upstream = {x.get("name") for x in metadata.get("fields", [])}
    absent = [x for x in SAFE_FIELDS if x not in upstream]
    count = request_json(SERVICE + "/query", {"where": "1=1", "returnCountOnly": "true", "f": "json"}).get("count")
    return {
        "ok": not absent and isinstance(count, int) and count > 1_000_000,
        "service": SERVICE,
        "layer": metadata.get("name"),
        "geometry_type": metadata.get("geometryType"),
        "max_record_count": metadata.get("maxRecordCount"),
        "record_count": count,
        "safe_fields_present": len(SAFE_FIELDS) - len(absent),
        "safe_fields_expected": len(SAFE_FIELDS),
        "missing_safe_fields": absent,
        "forbidden_fields_requested": sorted(FORBIDDEN_UPSTREAM_FIELDS.intersection(SAFE_FIELDS)),
        "privacy_contract": "owner_and_mailing_fields_not_requested"
    }


def update_status(path: pathlib.Path, result: dict) -> None:
    current = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"schema_version": 1}
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    current["generated_at"] = now
    summary = current.setdefault("summary", {})
    summary["njgin_geometry_records"] = result.get("record_count", 0)
    summary["njgin_connector_state"] = "healthy" if result.get("ok") else "failed"
    for stage in current.get("stages", []):
        if stage.get("id") == "njgin":
            stage["status"] = "passed" if result.get("ok") else "failed"
            stage["detail"] = (
                f"Live NJGIN layer reports {result.get('record_count', 0):,} parcel geometries; "
                f"{result.get('safe_fields_present', 0)}/{result.get('safe_fields_expected', 0)} safe fields available; "
                f"{len(result.get('forbidden_fields_requested', []))} forbidden fields requested."
            )
    current["latest_njgin_health"] = {**result, "checked_at": now}
    path.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")


def safe_value(value: str, label: str) -> str:
    value = value.strip()
    if not value or not KEY_RE.fullmatch(value):
        raise ValueError(f"Invalid {label}")
    return value.replace("'", "''")


def query(where: str, geometry: bool) -> dict:
    result = request_json(SERVICE + "/query", {
        "where": where,
        "outFields": ",".join(SAFE_FIELDS),
        "returnGeometry": "true" if geometry else "false",
        "outSR": "4326" if geometry else "3857",
        "f": "geojson" if geometry else "json"
    })
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--health", action="store_true")
    parser.add_argument("--pams-pin")
    parser.add_argument("--municipality")
    parser.add_argument("--block")
    parser.add_argument("--lot")
    parser.add_argument("--qualifier")
    parser.add_argument("--geometry", action="store_true")
    parser.add_argument("--write-status", action="store_true", help="Persist health result to Data Factory status")
    parser.add_argument("--status", default=str(DEFAULT_STATUS))
    args = parser.parse_args()
    try:
        if args.health or not any((args.pams_pin, args.municipality, args.block, args.lot)):
            result = health()
            if args.write_status:
                update_status(pathlib.Path(args.status), result)
            print(json.dumps(result, indent=2))
            return 0 if result["ok"] else 1
        if args.pams_pin:
            pin = safe_value(args.pams_pin, "PAMS PIN")
            where = f"PAMS_PIN='{pin}'"
        else:
            if not all((args.municipality, args.block, args.lot)):
                raise ValueError("municipality, block and lot are all required without --pams-pin")
            muni = safe_value(args.municipality, "municipality")
            block = safe_value(args.block, "block")
            lot = safe_value(args.lot, "lot")
            where = f"PCL_MUN='{muni}' AND PCLBLOCK='{block}' AND PCLLOT='{lot}'"
            if args.qualifier:
                qualifier = safe_value(args.qualifier, "qualifier")
                where += f" AND PCLQCODE='{qualifier}'"
        print(json.dumps(query(where, args.geometry), indent=2))
        return 0
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
