// Same plan rule as has_watchdog_plan('agent'): Agent plan or higher, or a developer account.
export const PLAN_ACTIVE = ["active", "trialing", "past_due"];
const AGENT_TIERS = new Set(["agent", "pro", "pro_plus", "pro+", "teams"]);
const DEFAULT_PREF = { enabled: true, weekday: 1, local_hour: 8, timezone: "America/New_York", last_sent_at: null };
export function recipients(prefs: any[], entitlements: any[], developers: any[]) {
  const eligible = new Set<string>([
    ...entitlements.filter((e) => PLAN_ACTIVE.includes(e.subscription_status) && AGENT_TIERS.has(String(e.billing_tier || e.plan_tier || "").toLowerCase())).map((e) => e.user_id),
    ...developers.map((d) => d.id)
  ]);
  const saved = new Map(prefs.map((p) => [p.user_id, p]));
  return [...eligible].map((id) => saved.get(id) || { ...DEFAULT_PREF, user_id: id }).filter((p) => p.enabled);
}
