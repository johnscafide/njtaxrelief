#!/usr/bin/env python3
"""Discovery-only probe for the public NJ DCA Affordable Housing Power BI report."""
from __future__ import annotations
import base64
import gzip
import json
import re
import zlib
from urllib.parse import parse_qs, urlparse
import requests

REPORT_URL = "https://app.powerbigov.us/view?r=eyJrIjoiMDE3MTgwNGEtNGVlNS00YTUyLWI3NTEtMTk5ZTBlYjMyNDQxIiwidCI6IjUwNzZjM2QxLTM4MDItNGI5Zi1iMzZhLWUwYTQxYmQ2NDJhNyJ9"
TARGET_PAGE = "Affordable Housing Supply & Demand"


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


def decode_binary(raw: str) -> dict:
    blob = base64.b64decode(raw)
    for fn in (gzip.decompress, zlib.decompress):
        try:
            return json.loads(fn(blob))
        except Exception:
            pass
    try:
        return json.loads(blob)
    except Exception as exc:
        raise RuntimeError(f"Unable to decode Power BI visual payload ({len(blob)} bytes)") from exc


def compact(obj, limit=9000):
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return text if len(text) <= limit else text[:limit] + "...<truncated>"


def main() -> None:
    resource = decode_resource(REPORT_URL)
    key = resource["k"]
    html = requests.get(REPORT_URL, timeout=30).text
    cluster = find([
        r"resolvedClusterUri\s*=\s*['\"]([^'\"]+)",
        r"resolvedClusterUri['\"]?\s*:\s*['\"]([^'\"]+)"
    ], html).replace("-redirect", "-api")
    request_id = find([r"requestId\s*=\s*['\"]([^'\"]+)", r"requestId['\"]?\s*:\s*['\"]([^'\"]+)"], html)
    activity_id = find([r"telemetrySessionId\s*=\s*['\"]\s*([^'\"]+)", r"telemetrySessionId['\"]?\s*:\s*['\"]([^'\"]+)"], html).strip()
    headers = {"ActivityId": activity_id, "RequestId": request_id, "X-PowerBI-ResourceKey": key, "User-Agent": "Watchdog-DCA-source-discovery/1.0"}
    endpoint = f"{cluster}/public/reports/{key}/modelsAndExploration?preferReadOnlySession=true"
    response = requests.get(endpoint, headers=headers, timeout=45)
    response.raise_for_status()
    data = response.json()
    print(compact({
        "resource_key": key,
        "cluster": cluster,
        "report_id": data.get("exploration", {}).get("report", {}).get("objectId"),
        "dataset_id": (data.get("models") or [{}])[0].get("dbName"),
        "model_id": (data.get("models") or [{}])[0].get("id"),
        "pages": [s.get("displayName") for s in data.get("exploration", {}).get("sections", [])],
    }))

    found = 0
    for section in data.get("exploration", {}).get("sections", []):
        page = section.get("displayName") or section.get("name")
        if page != TARGET_PAGE:
            continue
        for container in section.get("visualContainers", []):
            found += 1
            config_raw = container.get("config") or "{}"
            try:
                config = json.loads(config_raw)
            except Exception:
                config = {}
            visual = config.get("name")
            visual_type = (((config.get("singleVisual") or {}).get("visualType")) or "")
            print(f"\n=== VISUAL {found}: {visual} type={visual_type} ===")
            query_raw = container.get("query") or ""
            if query_raw:
                print("QUERY", query_raw[:12000])
            encoded = container.get("dataBinaryBase64Encoded")
            if not encoded:
                print("NO_PRELOADED_BINARY keys=", sorted(container.keys()))
                continue
            decoded = decode_binary(encoded)
            descriptor = (decoded.get("data") or {}).get("descriptor") or decoded.get("descriptor") or {}
            dsr = (decoded.get("data") or {}).get("dsr") or decoded.get("dsr") or {}
            print("DESCRIPTOR", compact(descriptor, 12000))
            print("DSR", compact(dsr, 12000))
    print("\nSUPPLY_DEMAND_VISUALS:", found)


if __name__ == "__main__":
    main()
