// Git-pinned production bootstrap: town CO and fire certificate requirements on the Transactions page.
// Only person-checked towns show requirements, fees or an application link (PR #542).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
await import("https://raw.githubusercontent.com/johnscafide/njtaxrelief/a7cfa78c2a9182b9a19c9d3e039b00597d38a5b1/supabase/functions/transaction-municipal-requirements/index.ts");
