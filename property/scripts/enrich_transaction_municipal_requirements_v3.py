#!/usr/bin/env python3
"""Statewide resale/CO/CCO requirement enrichment with expanded municipal vocabulary.

Builds on the v2 county-aware official-source parser, but recognizes additional labels
used by NJ municipalities such as certificate of compliance, property-transfer inspection,
transfer-of-title inspection, sale inspection, and continuing/continued occupancy variants.
The parser remains conservative: absence of a discoverable source never means not required.
"""
from __future__ import annotations
import importlib.util
import pathlib
import re

ROOT=pathlib.Path(__file__).resolve().parents[2]
V2=ROOT/'property/scripts/enrich_transaction_municipal_requirements_v2.py'
EXTRA_CO=(
    'continuing certificate of occupancy','certificate of continued occupancy','continued occupancy certificate',
    'certificate of compliance','resale occupancy certificate','resale cco','property transfer inspection',
    'transfer of title inspection','transfer inspection','transfer certificate','property transfer certificate',
    'change in occupancy','change-in-occupancy','change of ownership inspection','sale inspection',
    'dwelling resale inspection','residential resale inspection','occupancy certification'
)
EXTRA_SALE=(
    'conveyance','convey','transfer of title','transfer of property','new owner','new ownership',
    'prior to transfer','before transfer','upon transfer','property transfer','title transfer'
)

def load_v2():
    spec=importlib.util.spec_from_file_location('watchdog_municipal_requirements_v2',V2)
    if spec is None or spec.loader is None: raise RuntimeError('Could not load v2 extractor')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def expanded(pattern:re.Pattern,phrases:tuple[str,...])->re.Pattern:
    extra='|'.join(re.escape(x) for x in phrases)
    return re.compile(r'(?:'+pattern.pattern+r')|(?:\b(?:'+extra+r')\b)',re.I)

def main()->int:
    v2=load_v2();original_load=v2.load_base;original_build=v2.build_row_v2
    def load_base_v3():
        base=original_load()
        base.CO_TERMS=expanded(base.CO_TERMS,EXTRA_CO)
        base.SALE_TERMS=expanded(base.SALE_TERMS,EXTRA_SALE)
        return base
    def build_v3(base,muni,family,ordinance_by_key,ordinance_unique_name,generated):
        row=original_build(base,muni,family,ordinance_by_key,ordinance_unique_name,generated)
        if family=='resale_cco': row['title']='Resale / Continued Certificate of Occupancy (CCO)'
        metadata=dict(row.get('metadata') or {});metadata['extractor_version']=3;metadata['expanded_resale_synonyms']=True;row['metadata']=metadata
        return row
    v2.load_base=load_base_v3;v2.build_row_v2=build_v3
    return int(v2.main())

if __name__=='__main__': raise SystemExit(main())
