// Git-pinned production bootstrap: town CO and fire certificate requirements on the Transactions page.
// Only person-checked towns show requirements, fees or an application link (PR #542).
// A person-checked row always replaces older saved evidence (PR #544).
// Checked "not required" and "not confirmed" towns get plain descriptions (PR #546).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
await import("https://raw.githubusercontent.com/johnscafide/njtaxrelief/c76c4bb40226b0e1316226ef5ab96daba85c96af/supabase/functions/transaction-municipal-requirements/index.ts");
