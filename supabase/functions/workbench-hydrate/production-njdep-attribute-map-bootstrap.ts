// Workbench Hydrate production entry: the live v91 graph with the NJDEP attribute map.
//
// Live v91 runs production-epa-walkability-bootstrap.ts, which loads a chain of git-pinned
// modules. At the bottom of the chain, index.ts and csrr-provider.ts from commit 666fe739
// import './environment-provider.ts', which resolves to the URL imported below. The import map
// deployed with this entry (njdep-attribute-map.import-map.json) remaps that one URL to the local
// environment-provider.ts, which adds the explicit NJDEP attribute map. Every other module still
// loads from the commits v91 pins, and the two local epa files are byte-identical to v91.
//
// If the import map is not applied, hydrate behaves exactly like v91. The log line says which
// provider loaded, so the deploy can be checked in the function logs before running the canary.
import * as spatial from 'https://raw.githubusercontent.com/johnscafide/njtaxrelief/666fe7392ae43a8be7b7f2512b76894dc64262a2/supabase/functions/workbench-hydrate/environment-provider.ts';
import './production-epa-walkability-bootstrap.ts';

const attributeMap = (spatial as Record<string, unknown>).NJDEP_ATTRIBUTE_MAP_VERSION;
if (typeof attributeMap === 'string') console.info(`[workbench-hydrate] NJDEP attribute map active: ${attributeMap}`);
else console.error('[workbench-hydrate] NJDEP attribute map NOT active: import map not applied, serving the v91 environment provider');
