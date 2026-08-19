// Compatibility adapter for workbench-hydrate's historical CSRR import.
// Exact CSRR resolution is owned by environment-provider.ts so there is only one query/matching contract.
import { njdepObservation, isNjdepMarker, NJDEP_PROVIDER_VERSION, type SpatialObservation } from './environment-provider.ts';

type CsrrObservation=SpatialObservation&{source?:string};
const SOURCE='NJDEP CSRR SRP Preferred ID · exact COMU_CODE + PARCELS match';

export function isCsrrMarker(marker:any){
  return String(marker?.source_id||'')==='njdep-csrr-gis'&&isNjdepMarker(marker);
}

export async function csrrObservation(marker:any,row:any):Promise<CsrrObservation>{
  const observation=await njdepObservation(marker,row);
  return {...observation,source:SOURCE+' · '+NJDEP_PROVIDER_VERSION};
}

export const CSRR_PROVIDER_VERSION=NJDEP_PROVIDER_VERSION;
