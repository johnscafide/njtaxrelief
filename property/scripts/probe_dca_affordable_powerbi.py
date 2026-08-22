#!/usr/bin/env python3
"""Discovery-only probe for the public NJ DCA Affordable Housing Power BI report."""
from __future__ import annotations
import base64
import json
import re
from urllib.parse import parse_qs, urlparse
import requests

REPORT_URL = "https://app.powerbigov.us/view?r=eyJrIjoiMDE3MTgwNGEtNGVlNS00YTUyLWI3NTEtMTk5ZTBlYjMyNDQxIiwidCI6IjUwNzZjM2QxLTM4MDItNGI5Zi1iMzZhLWUwYTQxYmQ2NDJhNyJ9"
TARGET_PAGES = {"Affordable Housing Supply & Demand", "Affordable Housing Projects & Units", "Data Dictionary"}


def decode_resource(url: str) -> dict:
    token = parse_qs(urlparse(url).query)["r"][0]
    token += "=" * (-len(token) % 4)
    return json.loads(base64.urlsafe_b64decode(token.encode()).decode())


def find(patterns: list[str], text: str) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return match.group(1)
    raise RuntimeError(f"Power BI bootstrap variable not found: {patterns[0]}")


def compact(obj, limit=18000):
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return text if len(text) <= limit else text[:limit] + "...<truncated>"


def main() -> None:
    resource = decode_resource(REPORT_URL)
    key = resource["k"]
    html = requests.get(REPORT_URL, timeout=30).text
    cluster = find([r"resolvedClusterUri\s*=\s*['\"]([^'\"]+)", r"resolvedClusterUri['\"]?\s*:\s*['\"]([^'\"]+)"], html).replace("-redirect", "-api")
    request_id = find([r"requestId\s*=\s*['\"]([^'\"]+)", r"requestId['\"]?\s*:\s*['\"]([^'\"]+)"], html)
    activity_id = find([r"telemetrySessionId\s*=\s*['\"]\s*([^'\"]+)", r"telemetrySessionId['\"]?\s*:\s*['\"]([^'\"]+)"], html).strip()
    headers = {"ActivityId": activity_id, "RequestId": request_id, "X-PowerBI-ResourceKey": key, "User-Agent": "Watchdog-DCA-source-discovery/1.0"}
    endpoint = f"{cluster}/public/reports/{key}/modelsAndExploration?preferReadOnlySession=true"
    response = requests.get(endpoint, headers=headers, timeout=45)
    response.raise_for_status()
    data = response.json()
    print(compact({"resource_key": key, "cluster": cluster, "report_id": data.get("exploration", {}).get("report", {}).get("objectId"), "dataset_id": (data.get("models") or [{}])[0].get("dbName"), "model_id": (data.get("models") or [{}])[0].get("id")}))

    for section in data.get("exploration", {}).get("sections", []):
        page = section.get("displayName") or section.get("name")
        if page not in TARGET_PAGES:
            continue
        print(f"\n######## PAGE: {page} ########")
        for i, container in enumerate(section.get("visualContainers", []), 1):
            config_raw = container.get("config") or "{}"
            filters_raw = container.get("filters") or ""
            try:
                config = json.loads(config_raw)
            except Exception:
                config = {}
            sv = config.get("singleVisual") or {}
            print(f"\n=== VISUAL {i}: {config.get('name')} type={sv.get('visualType','')} ===")
            inspect = {
                "prototypeQuery": sv.get("prototypeQuery"),
                "projections": sv.get("projections"),
                "projectionOrdering": sv.get("projectionOrdering"),
                "vcObjects": sv.get("vcObjects"),
                "objects": sv.get("objects"),
                "visualType": sv.get("visualType"),
            }
            print("CONTRACT", compact(inspect))
            if filters_raw and filters_raw != "[]":
                try: print("FILTERS", compact(json.loads(filters_raw)))
                except Exception: print("FILTERS_RAW", filters_raw[:18000])
            # Print any strings that directly mention target concepts, including titles/data dictionary text.
            hits = []
            for term in ("subsid", "cost burden", "cost-burden", "low income", "lmi", "pipeline", "project", "municip", "hud"):
                if term in config_raw.lower(): hits.append(term)
            if hits:
                print("TARGET_HITS", hits)
                print("CONFIG", config_raw[:22000])


if __name__ == "__main__":
    main()
