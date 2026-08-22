#!/usr/bin/env python3
"""Discovery-only probe for the public NJ DCA Affordable Housing Power BI report.

Prints report/page/visual semantic-query metadata needed to identify the published
municipal LMI cost-burden and HUD-subsidized-unit fields. It does not write any
production artifact and must not be used as evidence of LIVE marker coverage.
The workflow runner is intentionally temporary and removed after discovery.
"""
from __future__ import annotations
import base64
import json
import re
from urllib.parse import parse_qs, urlparse
import requests

REPORT_URL = "https://app.powerbigov.us/view?r=eyJrIjoiMDE3MTgwNGEtNGVlNS00YTUyLWI3NTEtMTk5ZTBlYjMyNDQxIiwidCI6IjUwNzZjM2QxLTM4MDItNGI5Zi1iMzZhLWUwYTQxYmQ2NDJhNyJ9"
TARGETS = ("hud", "subsid", "lmi", "burden", "supply", "demand", "municip")


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


def main() -> None:
    resource = decode_resource(REPORT_URL)
    key = resource["k"]
    html = requests.get(REPORT_URL, timeout=30).text
    cluster = find([
        r"resolvedClusterUri\s*=\s*['\"]([^'\"]+)",
        r"resolvedClusterUri['\"]?\s*:\s*['\"]([^'\"]+)"
    ], html)
    cluster = cluster.replace("-redirect", "-api")
    request_id = find([
        r"requestId\s*=\s*['\"]([^'\"]+)",
        r"requestId['\"]?\s*:\s*['\"]([^'\"]+)"
    ], html)
    activity_id = find([
        r"telemetrySessionId\s*=\s*['\"]\s*([^'\"]+)",
        r"telemetrySessionId['\"]?\s*:\s*['\"]([^'\"]+)"
    ], html).strip()
    headers = {
        "ActivityId": activity_id,
        "RequestId": request_id,
        "X-PowerBI-ResourceKey": key,
        "User-Agent": "Watchdog-DCA-source-discovery/1.0",
    }
    endpoint = f"{cluster}/public/reports/{key}/modelsAndExploration?preferReadOnlySession=true"
    response = requests.get(endpoint, headers=headers, timeout=45)
    response.raise_for_status()
    data = response.json()
    print(json.dumps({
        "resource_key": key,
        "cluster": cluster,
        "model_count": len(data.get("models", [])),
        "report_id": data.get("exploration", {}).get("report", {}).get("objectId"),
        "dataset_id": (data.get("models") or [{}])[0].get("dbName"),
        "model_id": (data.get("models") or [{}])[0].get("id"),
        "section_count": len(data.get("exploration", {}).get("sections", [])),
    }, indent=2))

    matched = 0
    for section in data.get("exploration", {}).get("sections", []):
        page = section.get("displayName") or section.get("name")
        for container in section.get("visualContainers", []):
            config_raw = container.get("config") or "{}"
            query_raw = container.get("query") or ""
            text = f"{page}\n{config_raw}\n{query_raw}".lower()
            if not any(term in text for term in TARGETS):
                continue
            matched += 1
            try:
                config = json.loads(config_raw)
            except Exception:
                config = {}
            title = ""
            for candidate in re.findall(r'"text"\s*:\s*"([^\"]+)"', config_raw):
                if len(candidate) > len(title):
                    title = candidate
            print("\n=== MATCH", matched, "===")
            print("PAGE:", page)
            print("VISUAL:", config.get("name"))
            print("TITLE_HINT:", title[:300])
            print("QUERY:", query_raw[:12000])
    print("\nTARGET_VISUAL_MATCHES:", matched)


if __name__ == "__main__":
    main()
