#!/usr/bin/env python3
"""Build Watchdog v0.37 municipal affordable-housing source data from the official NJ DCA workbook.

The workbook is treated as source evidence, not as a legal/compliance determination. Project rows
are aggregated only by exact four-digit DCA municipality code. Trust-fund rows are municipal source
facts. Missing source values stay missing; HUD/LMI dashboard-only fields and an inferred "pipeline"
are intentionally excluded.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
SOURCE_PAGE='https://www.nj.gov/dca/dlps/hss/MuniStatusReporting.shtml'
SOURCE_AS_OF='2026-03-06'
REPORTING_PERIOD='February 2026'
VERSION='dca-affordable-housing-v037-feb-2026'
AUDIENCE=['attorney','agent','lender','appraiser','contractor','investor','municipal']

PROJECT_HEADERS={
 'Project ID':'project_id','DCA Muni Code':'dca_code','Municipality':'municipality','County':'county',
 'Date Building Permit Issued':'permit_date','Certificate of Occupancy Granted':'co_granted',
 'Single-Family':'affordable_units_single_family','Two-Family':'affordable_units_two_family',
 'Townhouse':'affordable_units_townhouse','Apartment':'affordable_units_apartment','Condo':'affordable_units_condo',
 'Manufactured Home':'affordable_units_manufactured_home','Mobile Home':'affordable_units_mobile_home',
 'Unit Type Unknown':'affordable_units_type_unknown',
 'Very Low Income (Affordable at 30% or Less of Area Median Income)':'affordable_units_very_low_income',
 'Affordability Level Unknown':'affordable_units_affordability_level_unknown',
 'Special Needs/Dis-abled':'affordable_units_special_needs','Family':'affordable_units_family',
 'Age-Restricted (Senior)':'affordable_units_age_restricted',
 'Beginning Date of Earliest Affordability Controls':'control_start',
 'Expiration Date of Earliest Affordability Controls':'control_expiration',
 'Affordability Restriction Term (in Years) - Earliest Controls':'control_term',
}
TRUST_HEADERS={
 'DCA Muni Code':'dca_code','Municipality':'municipality','County':'county',
 'Can Retain Non-Residential Development Fee?':'ahtf_can_retain_nonresidential_development_fee',
 'Has Confirmed Affordable Housing Trust Fund?':'ahtf_confirmed','No AHTF Data Submitted':'ahtf_no_data_submitted',
 'Total Income Since Inception':'ahtf_total_income_since_inception',
 'Total Expenditures Since Inception':'ahtf_total_expenditures_since_inception',
 'Residential Development Fees':'ahtf_residential_development_fees',
 'Nonresidential Development Fees':'ahtf_nonresidential_development_fees',
 'Interest Earned':'ahtf_interest_earned','Municipal Contributions':'ahtf_municipal_contributions',
 'Homeownership Assistance':'ahtf_homeownership_assistance','Rental Assistance':'ahtf_rental_assistance',
 'New Construction':'ahtf_new_construction_expenditures',
}
PROJECT_SUM_FIELDS=[v for v in PROJECT_HEADERS.values() if v.startswith('affordable_units_')]
TRUST_NUMERIC={v for v in TRUST_HEADERS.values() if v.startswith('ahtf_') and v not in {
 'ahtf_can_retain_nonresidential_development_fee','ahtf_confirmed','ahtf_no_data_submitted'}}


def marker(field,label,source_field,kind='derived_governed',unit=None,reason=None):
    row={
      'id':f'njplus.nj-dca-affordable-housing.{field}','label':label,
      'description':reason or f'NJ DCA February 2026 Affordable Housing Municipal Status Report: {label}.',
      'category':'affordable housing monitoring','scope':'municipality','tier':'pro_plus','origin':'public',
      'professions':AUDIENCE,'source_id':'nj-dca-affordable-housing','field':field,'source_field':source_field,
      'provider_kind':kind,'professional_reason':reason or 'Use the exact DCA-published municipal record as research context; verify the official record before reliance.'
    }
    if unit: row['unit']=unit
    return row

MARKERS=[
 marker('reported_affordable_project_count','Reported affordable-housing project count','Project ID',reason='Count of project rows reported by the municipality in the DCA monitoring workbook; not a comprehensive inventory of all affordable housing.'),
 marker('affordable_units_single_family','Affordable single-family units','Single-Family',unit='units'),
 marker('affordable_units_two_family','Affordable two-family units','Two-Family',unit='units'),
 marker('affordable_units_townhouse','Affordable townhouse units','Townhouse',unit='units'),
 marker('affordable_units_apartment','Affordable apartment units','Apartment',unit='units'),
 marker('affordable_units_condo','Affordable condominium units','Condo',unit='units'),
 marker('affordable_units_manufactured_home','Affordable manufactured-home units','Manufactured Home',unit='units'),
 marker('affordable_units_mobile_home','Affordable mobile-home units','Mobile Home',unit='units'),
 marker('affordable_units_type_unknown','Affordable units with unknown unit type','Unit Type Unknown',unit='units'),
 marker('affordable_units_very_low_income','Very-low-income affordable units','Very Low Income (Affordable at 30% or Less of Area Median Income)',unit='units'),
 marker('affordable_units_affordability_level_unknown','Affordable units with unknown affordability level','Affordability Level Unknown',unit='units'),
 marker('affordable_units_special_needs','Special-needs / disabled affordable units','Special Needs/Dis-abled',unit='units'),
 marker('affordable_units_family','Family-restricted affordable units','Family',unit='units'),
 marker('affordable_units_age_restricted','Age-restricted affordable units','Age-Restricted (Senior)',unit='units'),
 marker('projects_with_building_permit','Reported projects with building-permit date','Date Building Permit Issued',reason='Count of DCA project rows with a populated building-permit date. A populated date is not a finding about current construction status.'),
 marker('projects_with_certificate_of_occupancy','Reported projects with certificate of occupancy','Certificate of Occupancy Granted',reason='Count of DCA project rows where Certificate of Occupancy Granted is exactly Y.'),
 marker('earliest_affordability_control_start_date','Earliest reported affordability-control start','Beginning Date of Earliest Affordability Controls',unit='date',reason='Earliest valid reported project-level start date among the municipality records in this workbook.'),
 marker('earliest_affordability_control_expiration_date','Earliest reported affordability-control expiration','Expiration Date of Earliest Affordability Controls',unit='date',reason='Earliest valid reported project-level expiration date among the municipality records in this workbook; not a legal conclusion about current restriction status.'),
 marker('minimum_affordability_restriction_term_years','Minimum reported affordability restriction term','Affordability Restriction Term (in Years) - Earliest Controls',unit='years',reason='Minimum positive numeric term reported across municipal project rows; values are preserved as source-entered and not interpreted legally.'),
 marker('ahtf_can_retain_nonresidential_development_fee','AHTF can retain nonresidential development fee','Can Retain Non-Residential Development Fee?',kind='authoritative_reference'),
 marker('ahtf_confirmed','Confirmed affordable housing trust fund','Has Confirmed Affordable Housing Trust Fund?',kind='authoritative_reference'),
 marker('ahtf_no_data_submitted','AHTF no-data-submitted indicator','No AHTF Data Submitted',kind='authoritative_reference'),
 marker('ahtf_total_income_since_inception','AHTF total income since inception','Total Income Since Inception',kind='authoritative_reference',unit='USD'),
 marker('ahtf_total_expenditures_since_inception','AHTF total expenditures since inception','Total Expenditures Since Inception',kind='authoritative_reference',unit='USD'),
 marker('ahtf_residential_development_fees','AHTF residential development fees','Residential Development Fees',kind='authoritative_reference',unit='USD'),
 marker('ahtf_nonresidential_development_fees','AHTF nonresidential development fees','Nonresidential Development Fees',kind='authoritative_reference',unit='USD'),
 marker('ahtf_interest_earned','AHTF interest earned','Interest Earned',kind='authoritative_reference',unit='USD'),
 marker('ahtf_municipal_contributions','AHTF municipal contributions','Municipal Contributions',kind='authoritative_reference',unit='USD'),
 marker('ahtf_homeownership_assistance','AHTF homeownership assistance expenditures','Homeownership Assistance',kind='authoritative_reference',unit='USD'),
 marker('ahtf_rental_assistance','AHTF rental assistance expenditures','Rental Assistance',kind='authoritative_reference',unit='USD'),
 marker('ahtf_new_construction_expenditures','AHTF new-construction expenditures','New Construction',kind='authoritative_reference',unit='USD'),
]

SEMANTIC_CORRECTIONS={
 'njplus.nj-dca-affordable-housing.low_income_households':{
   'label':'Low-income affordable units','description':'Legacy marker ID retained for compatibility. The DCA source column is Low Income affordable units (30%–50% of area median income), not a household count.','source_field':'Low Income (Affordable between 30% and 50% of Area Median Income)','unit':'units','semantic_note':'Legacy field name says households; source semantics are affordable-unit count.'},
 'njplus.nj-dca-affordable-housing.moderate_income_households':{
   'label':'Moderate-income affordable units','description':'Legacy marker ID retained for compatibility. The DCA source column is Moderate Income affordable units (50%–80% of area median income), not a household count.','source_field':'Moderate Income (Affordable between 50% and 80% of Area Median Income)','unit':'units','semantic_note':'Legacy field name says households; source semantics are affordable-unit count.'},
}


def colnum(ref):
    letters=re.match(r'[A-Z]+',ref).group(0);n=0
    for ch in letters:n=n*26+ord(ch)-64
    return n

def number(v):
    if v in ('','--','-','#VALUE!'): return None
    try:
        f=float(v)
        if f!=f:return None
        return int(f) if f.is_integer() else round(f,2)
    except Exception:return None

def excel_date(v):
    try:
        f=float(v)
        if not 1<=f<=100000:return None
        return (datetime(1899,12,30)+timedelta(days=f)).date().isoformat()
    except Exception:return None

def clean(v):
    return str(v or '').replace('\u00a0',' ').strip()

def workbook_rows(path:Path,sheet_path:str,shared:list[str]):
    with zipfile.ZipFile(path) as z:
        root=ET.fromstring(z.read(sheet_path))
    for row in root.find(f'{{{NS}}}sheetData'):
        out={}
        for c in row:
            t=c.attrib.get('t');v=c.find(f'{{{NS}}}v')
            if t=='inlineStr': value=''.join(x.text or '' for x in c.iter(f'{{{NS}}}t'))
            elif v is None:value=''
            else:
                value=v.text or ''
                if t=='s':value=shared[int(value)]
            out[colnum(c.attrib['r'])]=clean(value)
        yield int(row.attrib['r']),out

def shared_strings(path:Path):
    with zipfile.ZipFile(path) as z:
        root=ET.fromstring(z.read('xl/sharedStrings.xml'))
    return [''.join(t.text or '' for t in si.iter(f'{{{NS}}}t')) for si in root.findall(f'{{{NS}}}si')]

def header_index(rows,required:dict[str,str]):
    for rn,row in rows:
        if rn>10:break
        by_name={clean(v):c for c,v in row.items() if clean(v)}
        if all(name in by_name for name in required):
            return rn,{field:by_name[name] for name,field in required.items()}
    raise RuntimeError('Expected DCA source headers not found; refusing to guess source semantics.')

def build(source:Path):
    shared=shared_strings(source)
    project_rows=list(workbook_rows(source,'xl/worksheets/sheet2.xml',shared))
    trust_rows=list(workbook_rows(source,'xl/worksheets/sheet3.xml',shared))
    ph,pc=header_index(project_rows,PROJECT_HEADERS)
    th,tc=header_index(trust_rows,TRUST_HEADERS)
    municipalities={};project_count=0;project_munis=set();trust_count=0;trust_munis=set()
    for rn,row in project_rows:
        if rn<=ph:continue
        code=clean(row.get(pc['dca_code']))
        if not re.fullmatch(r'\d{4}',code):continue
        project_count+=1;project_munis.add(code)
        rec=municipalities.setdefault(code,{'district':code,'municipality':clean(row.get(pc['municipality'])) or None,'county':clean(row.get(pc['county'])) or None})
        rec['reported_affordable_project_count']=rec.get('reported_affordable_project_count',0)+1
        for field in PROJECT_SUM_FIELDS:
            n=number(row.get(pc[field],''))
            if n is not None:rec[field]=round(float(rec.get(field,0))+float(n),2)
        if clean(row.get(pc['permit_date'])) not in ('','--'):
            rec['projects_with_building_permit']=rec.get('projects_with_building_permit',0)+1
        if clean(row.get(pc['co_granted']))=='Y':
            rec['projects_with_certificate_of_occupancy']=rec.get('projects_with_certificate_of_occupancy',0)+1
        start=excel_date(row.get(pc['control_start'],''));exp=excel_date(row.get(pc['control_expiration'],''));term=number(row.get(pc['control_term'],''))
        if start and (not rec.get('earliest_affordability_control_start_date') or start<rec['earliest_affordability_control_start_date']):rec['earliest_affordability_control_start_date']=start
        if exp and (not rec.get('earliest_affordability_control_expiration_date') or exp<rec['earliest_affordability_control_expiration_date']):rec['earliest_affordability_control_expiration_date']=exp
        if term is not None and float(term)>0 and (rec.get('minimum_affordability_restriction_term_years') is None or float(term)<float(rec['minimum_affordability_restriction_term_years'])):
            rec['minimum_affordability_restriction_term_years']=round(float(term),2)
    for rn,row in trust_rows:
        if rn<=th:continue
        code=clean(row.get(tc['dca_code']))
        if not re.fullmatch(r'\d{4}',code):continue
        trust_count+=1;trust_munis.add(code)
        rec=municipalities.setdefault(code,{'district':code,'municipality':clean(row.get(tc['municipality'])) or None,'county':clean(row.get(tc['county'])) or None})
        for field in TRUST_NUMERIC:
            n=number(row.get(tc[field],''))
            if n is not None:rec[field]=n
        for field in ('ahtf_can_retain_nonresidential_development_fee','ahtf_confirmed','ahtf_no_data_submitted'):
            raw=clean(row.get(tc[field]))
            rec[field]=None if raw in ('','--') else raw
    for rec in municipalities.values():
        rec.setdefault('projects_with_building_permit',0);rec.setdefault('projects_with_certificate_of_occupancy',0)
        if rec.get('reported_affordable_project_count',0)>0:
            for field in PROJECT_SUM_FIELDS:rec.setdefault(field,0)
        for k,v in list(rec.items()):
            if isinstance(v,float) and v.is_integer():rec[k]=int(v)
    if len(trust_munis)!=564 or len(municipalities)!=564:
        raise RuntimeError(f'Expected 564 municipal AHTF rows; got trust={len(trust_munis)}, merged={len(municipalities)}')
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    artifact={
      'schema_version':1,'version':VERSION,'generated_at':datetime.now(timezone.utc).isoformat(),
      'source_page':SOURCE_PAGE,'source_workbook':source.name,'source_workbook_sha256':digest,
      'reporting_period':REPORTING_PERIOD,'source_as_of':SOURCE_AS_OF,
      'source_notes':[
        'DCA describes this report as selected data entered by municipalities in the Affordable Housing Monitoring System.',
        'The report states it is not a comprehensive listing of all affordable housing units/developments in New Jersey.',
        'The report states the data are presented as-is and DCA makes no certifications as to accuracy.',
        'HUD-subsidized units, LMI cost burden and an inferred affordable-units pipeline are intentionally excluded.'
      ],
      'semantic_corrections':SEMANTIC_CORRECTIONS,
      'diagnostics':{'project_rows':project_count,'project_municipalities':len(project_munis),'trust_rows':trust_count,'trust_municipalities':len(trust_munis),'municipalities_total':len(municipalities)},
      'municipalities':dict(sorted(municipalities.items()))
    }
    pack={'schema_version':1,'version':'0.37.0','released':'2026-08-27','definition':'Exact NJ DCA February 2026 Affordable Housing Municipal Status Report fields. Project aggregates are governed calculations over reported project rows; AHTF fields are direct municipal source facts. No legal/compliance conclusion is inferred.','activation_rule':'Catalog inclusion does not imply live coverage; production provider coverage and canary certification remain authoritative.','markers':MARKERS,'semantic_corrections':SEMANTIC_CORRECTIONS}
    return artifact,pack

def main():
    ap=argparse.ArgumentParser();ap.add_argument('source',type=Path);ap.add_argument('--artifact',type=Path,default=Path('property/data/affordable-housing-v037.json'));ap.add_argument('--pack',type=Path,default=Path('property/data/nj-source-pack-v037.json'));args=ap.parse_args()
    artifact,pack=build(args.source);args.artifact.parent.mkdir(parents=True,exist_ok=True);args.pack.parent.mkdir(parents=True,exist_ok=True)
    args.artifact.write_text(json.dumps(artifact,separators=(',',':')),encoding='utf-8');args.pack.write_text(json.dumps(pack,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'artifact':str(args.artifact),'pack':str(args.pack),'markers':len(MARKERS),**artifact['diagnostics']},indent=2))

if __name__=='__main__':main()
