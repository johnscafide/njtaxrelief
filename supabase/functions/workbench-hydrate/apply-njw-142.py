#!/usr/bin/env python3
from pathlib import Path
p=Path(__file__).with_name("index.ts")
s=p.read_text(encoding="utf-8")
imp="import { njdepValue, isNjdepMarker, NJDEP_PROVIDER_VERSION } from './environment-provider.ts';\n"
if imp not in s: s=imp+s
old="const m:any=byId.get(id),fam=family(m,r,root);let v=fam?.v,kind=fam?.kind||null,source=fam?.source||null;"
new="""const m:any=byId.get(id);let fam=family(m,r,root);if(!fam&&isNjdepMarker(m)){const ev=await njdepValue(m,r);fam={v:ev,kind:'authoritative_spatial_reference',source:'NJDEP ArcGIS public GIS · '+NJDEP_PROVIDER_VERSION};}let v=fam?.v,kind=fam?.kind||null,source=fam?.source||null;"""
if old not in s:
    raise SystemExit("PATCH FAILED: audited workbench-hydrate resolver anchor was not found. Do not deploy.")
s=s.replace(old,new,1)
p.write_text(s,encoding="utf-8")
print("Patched",p)
