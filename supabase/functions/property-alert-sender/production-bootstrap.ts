// Git-pinned production bootstrap: property alert emails (PRs #519, #521).
// Auth is the x-property-alert-token worker token, checked via verify_property_alert_worker.
// The reviewed sender is imported from the exact merged commit.
import 'https://raw.githubusercontent.com/johnscafide/njtaxrelief/228e02dac9ecc403b0b434e757e18e7ee1e6af23/supabase/functions/property-alert-sender/index.ts';
