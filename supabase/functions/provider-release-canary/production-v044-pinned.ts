// Git-pinned production entrypoint for provider-release-canary v044 (catalog_njdep_layers_v1).
// Loads the reviewed v044 bootstrap and its canary module from the exact commit; every
// other scenario is handed to the v043 graph pinned inside that bootstrap.
import 'https://raw.githubusercontent.com/johnscafide/njtaxrelief/79d59cb1df3407112d63ef3bbec4628579fd16dc/supabase/functions/provider-release-canary/production-v044-bootstrap.ts';
