#!/usr/bin/env python3
"""Monitor official NJ publication surfaces without mistaking dynamic pages for releases.

The monitor is intentionally *not* a data publisher.  It keeps a dated health
history, waits for the same stable publisher token on two daily observations
before declaring a source update, and sends only confirmed updates to Watchdog.
Raw source payloads and property records are never written to this repository.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import urllib.request
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "property/data/source-registry.json"
PROPLUS_CATALOG = ROOT / "property/data/nj-proplus-source-catalog-v031.json"
STATE = ROOT / "property/data/source-watch-state.json"
HISTORY = ROOT / "property/data/source-watch-history.json"
REPORT = ROOT / "property/data/source-monitor-report.json"


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def fingerprint(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={
        "User-Agent": "Watchdog-source-monitor/2.0 (+https://njpropertytaxrelief.com/property/)",
        "Accept": "text/html,application/json,application/octet-stream;q=0.8,*/*;q=0.5",
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read(2_000_000)
        etag = response.headers.get("ETag")
        modified = response.headers.get("Last-Modified")
        # SHA is diagnostic only. Many public web applications inject a request
        # id, timestamp or session material into otherwise unchanged HTML.
        return {
            "status": response.status,
            "etag": etag,
            "last_modified": modified,
            "content_length": response.headers.get("Content-Length"),
            "sha256_prefix_2mb": hashlib.sha256(body).hexdigest(),
            "stable_token": (f"last_modified:{modified}" if modified else f"etag:{etag}" if etag else None),
        }


def read_json(path: pathlib.Path, fallback: dict[str, Any]) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def sources() -> list[dict[str, Any]]:
    values = [x for x in read_json(REGISTRY, {"datasets": []}).get("datasets", []) if x.get("source_url")]
    for item in read_json(PROPLUS_CATALOG, {"sources": []}).get("sources", []):
        if item.get("url"):
            values.append({
                "id": item["id"], "label": item["label"], "agency": item["agency"],
                "source_url": item["url"], "cadence": item.get("cadence", "source change"), "monitor_only": True,
            })
    # A source can appear in both registries. Check it once, preserving the
    # richer catalog metadata when available.
    by_id = {item["id"]: item for item in values}
    return list(by_id.values())


def compact_observation(item: dict[str, Any], fp: dict[str, Any], checked_at: str) -> dict[str, Any]:
    return {
        "id": item["id"], "label": item.get("label", item["id"]), "agency": item.get("agency", "New Jersey publisher"),
        "url": item["source_url"], "checked_at": checked_at, "status": fp["status"],
        "etag": fp.get("etag"), "last_modified": fp.get("last_modified"), "content_length": fp.get("content_length"),
        "stable_token": fp.get("stable_token"), "sha256_prefix_2mb": fp.get("sha256_prefix_2mb"),
    }


def trim_history(history: dict[str, Any], retention_days: int) -> dict[str, Any]:
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=retention_days)
    observations = []
    for value in history.get("observations", []):
        try:
            if dt.datetime.fromisoformat(value["checked_at"]).astimezone(dt.timezone.utc) >= cutoff:
                observations.append(value)
        except (KeyError, TypeError, ValueError):
            continue
    history["observations"] = observations
    return history


def deliver(url: str | None, token_env: str, report: dict[str, Any]) -> dict[str, Any] | None:
    if not url:
        return None
    token = os.environ.get(token_env)
    if not token:
        return {"ok": False, "error": f"Missing {token_env}"}
    try:
        payload = json.dumps({
            "checked_at": report["checked_at"], "checked": report["checked"],
            "changes": report["changed"], "errors": report["errors"],
            "observations": report["observations"], "schema_version": report["schema_version"],
        }).encode()
        request = urllib.request.Request(url, data=payload, headers={
            "Authorization": "Bearer " + token, "Content-Type": "application/json"
        }, method="POST")
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read() or b"{}"
            return {"ok": 200 <= response.status < 300, "status": response.status, "response": json.loads(body)}
    except Exception as error:  # delivery must be visible, but never hides the source report
        return {"ok": False, "error": str(error)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--accept", action="store_true", help="Accept pending tokens as the review baseline")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--emit-url")
    parser.add_argument("--token-env", default="SUPABASE_SERVICE_ROLE_KEY")
    parser.add_argument("--history-retention-days", type=int, default=730)
    args = parser.parse_args()
    watch = sources()
    if args.list:
        print("\n".join(f"{x['id']}\t{x.get('cadence', '')}\t{x['source_url']}" for x in watch))
        return 0

    checked_at = now()
    state = read_json(STATE, {"schema_version": 2, "sources": {}})
    state.setdefault("sources", {})
    baseline_missing = not bool(state.get("accepted_at"))
    history = trim_history(read_json(HISTORY, {"schema_version": 1, "observations": []}), max(30, args.history_retention_days))
    observations: list[dict[str, Any]] = []
    changed: list[dict[str, Any]] = []
    suspected: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for item in watch:
        source_id = item["id"]
        try:
            observation = compact_observation(item, fingerprint(item["source_url"]), checked_at)
            observations.append(observation)
            prior = state["sources"].get(source_id)
            token = observation.get("stable_token")
            if not prior:
                state["sources"][source_id] = {"accepted": observation, "latest": observation, "pending": None}
                continue
            prior["latest"] = observation
            accepted = (prior.get("accepted") or {}).get("stable_token")
            if not token:
                # Browser-rendered pages without a publisher revision header are
                # health checked but cannot create an authoritative update claim.
                prior["pending"] = None
                continue
            if token == accepted:
                prior["pending"] = None
                continue
            pending = prior.get("pending") or {}
            if pending.get("stable_token") != token:
                pending = {"stable_token": token, "first_seen_at": checked_at, "sightings": 1, "observation": observation}
                prior["pending"] = pending
                suspected.append({"id": source_id, "label": observation["label"], "agency": observation["agency"], "url": observation["url"], "after": observation, "reason": "awaiting a second daily confirmation"})
                continue
            pending["sightings"] = int(pending.get("sightings", 1)) + 1
            prior["pending"] = pending
            if pending["sightings"] < 2:
                suspected.append({"id": source_id, "label": observation["label"], "agency": observation["agency"], "url": observation["url"], "after": observation, "reason": "awaiting a second daily confirmation"})
                continue
            changed.append({"id": source_id, "label": observation["label"], "agency": observation["agency"], "url": observation["url"], "before": prior.get("accepted"), "after": observation, "confirmation": "same stable publisher token observed on two daily checks"})
            # Record the confirmed publisher revision; it remains historical in
            # the observation ledger and may later be associated with a validated
            # warehouse source_release.
            prior["accepted"] = observation
            prior["pending"] = None
        except Exception as error:
            errors.append({"id": source_id, "url": item["source_url"], "error": str(error)})

    if baseline_missing and state["sources"]:
        # The initial observation is a baseline, not a publisher update.
        state["accepted_at"] = checked_at
    if args.accept:
        for entry in state["sources"].values():
            if entry.get("pending"):
                entry["accepted"] = entry["pending"].get("observation", entry.get("latest"))
                entry["pending"] = None
        state["accepted_at"] = checked_at
    history["observations"].extend(observations)
    history.update({"schema_version": 1, "updated_at": checked_at, "retention_days": max(30, args.history_retention_days)})
    report = {
        "schema_version": 2, "checked_at": checked_at, "checked": len(observations), "changed": changed,
        "suspected": suspected, "errors": errors, "observations": observations,
        "baseline_missing": baseline_missing,
        "policy": "A source update needs the same ETag or Last-Modified token on two daily checks. Content hashes are diagnostic only.",
    }
    report["event_delivery"] = deliver(args.emit_url, args.token_env, report)
    STATE.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    HISTORY.write_text(json.dumps(history, indent=2) + "\n", encoding="utf-8")
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"checked": len(observations), "confirmed": len(changed), "pending": len(suspected), "errors": len(errors)}))
    # Availability failures are reported and retained; a scheduled job should
    # stay green so a temporary state outage does not become alert noise.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
