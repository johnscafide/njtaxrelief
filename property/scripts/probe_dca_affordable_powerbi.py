#!/usr/bin/env python3
"""Discovery-only probe for exact municipal fields in NJ DCA Affordable Housing Power BI."""
from __future__ import annotations
import base64, json, re, uuid
from urllib.parse import parse_qs, urlparse
import requests

REPORT_URL="https://app.powerbigov.us/view?r=eyJrIjoiMDE3MTgwNGEtNGVlNS00YTUyLWI3NTEtMTk5ZTBlYjMyNDQxIiwidCI6IjUwNzZjM2QxLTM4MDItNGI5Zi1iMzZhLWUwYTQxYmQ2NDJhNyJ9"

def decode_resource(url):
    token=parse_qs(urlparse(url).query)["r"][0]; token += "="*(-len(token)%4)
    return json.loads(base64.urlsafe_b64decode(token).decode())
def find(patterns,text):
    for p in patterns:
        m=re.search(p,text,re.I)
        if m:return m.group(1)
    raise RuntimeError(patterns[0])
def walk(obj,path=""):
    if isinstance(obj,dict):
        for k,v in obj.items():
            p=f"{path}.{k}" if path else k
            if any(t in str(k).lower() for t in ("pipeline","status","stage","project","control","afford","hud","burden")):
                print("SCHEMA_KEY",p,repr(v)[:1500])
            walk(v,p)
    elif isinstance(obj,list):
        for i,v in enumerate(obj): walk(v,f"{path}[{i}]")

def main():
    key=decode_resource(REPORT_URL)["k"]
    html=requests.get(REPORT_URL,timeout=30).text
    cluster=find([r"resolvedClusterUri\s*=\s*['\"]([^'\"]+)",r"resolvedClusterUri['\"]?\s*:\s*['\"]([^'\"]+)"],html).replace("-redirect","-api")
    request_id=find([r"requestId\s*=\s*['\"]([^'\"]+)",r"requestId['\"]?\s*:\s*['\"]([^'\"]+)"],html)
    activity_id=find([r"telemetrySessionId\s*=\s*['\"]\s*([^'\"]+)",r"telemetrySessionId['\"]?\s*:\s*['\"]([^'\"]+)"],html).strip()
    headers={"ActivityId":activity_id,"RequestId":request_id,"X-PowerBI-ResourceKey":key,"Content-Type":"application/json","User-Agent":"Watchdog-DCA-source-discovery/1.0"}
    meta=requests.get(f"{cluster}/public/reports/{key}/modelsAndExploration?preferReadOnlySession=true",headers=headers,timeout=45).json()
    model=(meta.get("models") or [{}])[0]; model_id=model.get("id")
    print("MODEL",model_id,model.get("dbName"),"KEYS",sorted(model.keys()))
    # Search model metadata only for potentially useful pipeline/status fields.
    for candidate in (model.get("dbSchema"),model.get("schema"),model.get("entities"),model.get("model")):
        if candidate: walk(candidate)

    query={"Version":2,"From":[{"Name":"h","Entity":"HUD and Census Data","Type":0}],"Select":[
      {"Column":{"Expression":{"SourceRef":{"Source":"h"}},"Property":"Municipality"},"Name":"HUD and Census Data.Municipality","NativeReferenceName":"Municipality"},
      {"Aggregation":{"Expression":{"Column":{"Expression":{"SourceRef":{"Source":"h"}},"Property":"HUD Units Final"}},"Function":0},"Name":"Sum(HUD and Census Data.HUD Units Final)","NativeReferenceName":"HUD Subsidized Units (2024)"},
      {"Measure":{"Expression":{"SourceRef":{"Source":"h"}},"Property":"LMI Cost-Burdened"},"Name":"HUD and Census Data.LMI Cost-Burdened","NativeReferenceName":"LMI Cost-Burdened Households (2022)"},
      {"Measure":{"Expression":{"SourceRef":{"Source":"h"}},"Property":"% LMI Cost-Burdened"},"Name":"HUD and Census Data.% LMI Cost-Burdened","NativeReferenceName":"% LMI Cost-Burdened (2022)"}
    ],"OrderBy":[{"Direction":1,"Expression":{"Column":{"Expression":{"SourceRef":{"Source":"h"}},"Property":"Municipality"}}}]}
    command={"SemanticQueryDataShapeCommand":{"Query":query,"Binding":{"DataReduction":{"DataVolume":6,"Primary":{"Window":{"Count":1000}}},"Primary":{"Groupings":[{"Projections":[0,1,2,3],"Subtotal":1}]} ,"Version":1},"ExecutionMetricsKind":1}}
    body={"version":"1.0.0","queries":[{"Query":{"Commands":[command]},"ApplicationContext":{"DatasetId":model.get("dbName"),"Sources":[{"ReportId":meta.get("exploration",{}).get("report",{}).get("objectId")}],"outboundCallsAllowed":True}}],"cancelQueries":[],"modelId":model_id}
    qheaders=dict(headers); qheaders["RequestId"]=str(uuid.uuid4())
    r=requests.post(f"{cluster}/public/reports/querydata?synchronous=true",headers=qheaders,json=body,timeout=60)
    print("QUERY_STATUS",r.status_code)
    print("QUERY_RESPONSE",r.text[:120000])

if __name__=="__main__":main()
