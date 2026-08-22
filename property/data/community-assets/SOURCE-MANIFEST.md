# NJ DCA Community Asset access source manifest

Verified 2026-08-22 against the current NJ Department of Community Affairs **Community Asset Map 2.0** ArcGIS Experience.

## Governing application

- Experience item: `1f30e2e9dc954b6eaafb510c170a3234`
- Web map/data source item: `f3e1f9f0b91e4e8b8bb4881ce1b63bf2`
- Application owner: `NJDCA.GIS`
- Current application workflow: ArcGIS Near Me / proximity analysis.

## Watchdog access contract

The six `*_access` markers are **property-level spatial screening booleans**. Watchdog checks the canonical NJ parcel centroid against the exact DCA Community Asset Map layer within a **1 statute mile (1609.344 meter) straight-line ArcGIS proximity radius**.

`true` means at least one qualifying published feature is within the radius. `false` means the source was successfully checked and no qualifying feature was found within the radius. Missing parcel coordinates or a provider failure remain explicit missing/error states; they are never converted to `false`.

This is not a walking/driving time claim, service-quality assessment, eligibility finding, or guarantee that a facility is currently operating.

| Marker | DCA Community Asset Map layer | Service / item contract |
| --- | --- | --- |
| `transit_station_access` | Passenger Rail Stations | `NJ_Passenger_Rail_Stations/FeatureServer/0`, item `4e8764433a5a4eb9a323635b428c6f22` |
| `bus_terminal_access` | Bus Terminals | `Bus_Terminals_2021/FeatureServer/9`, item `beff8e163cf149649da214496f52be41` |
| `hospital_access` | Hospitals | `Hospitals/FeatureServer/1` as referenced by the current DCA Experience |
| `college_access` | Colleges And Universities | `Colleges_And_Universities/FeatureServer/2`, item `7fb7ebf5fa234fdab46da3f94a813ecd` |
| `park_access` | Open Space | `Open_Space/FeatureServer/66`, restricted to `PRIMARY_USE='23'` (Park) and `ACCESS_TYPE='Public Access'` |
| `library_access` | Libraries | `Libraries_2023/FeatureServer/11`, item `9341dca37cdf4f258f2df6ae439f5be4` |

## Independent control before runtime promotion

Control parcel: `0102_139_15`, 14 S Mansion Ave, Atlantic City.

The official NJ parcel geometry was independently resolved and each source was queried at a 1609.344 meter radius before the provider implementation was staged. All six target categories had at least one qualifying control hit. The park control used the exact Park + Public Access filter rather than treating every open-space feature as a park.

## Governance boundary

Source discovery alone does not make these markers LIVE. Promotion requires the reviewed runtime mapping, authenticated production customer-path canary, exact provider-kind/source assertions, production provider-coverage update, and canonical Phase 5 reconciliation.