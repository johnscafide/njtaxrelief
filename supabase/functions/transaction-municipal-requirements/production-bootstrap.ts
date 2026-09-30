// Git-pinned production bootstrap: town CO and fire certificate requirements on the Transactions page.
// Only person-checked towns show requirements, fees or an application link (PR #542).
// A person-checked row always replaces older saved evidence (PR #544).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
await import("https://raw.githubusercontent.com/johnscafide/njtaxrelief/4e35cbd56379b55ba2c213188a23770b402f51d2/supabase/functions/transaction-municipal-requirements/index.ts");
