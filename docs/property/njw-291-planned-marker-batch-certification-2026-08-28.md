# NJW-291 planned marker batch certification

## Uniformity Percentile

**Marker:** `uniformity.percentile`

The canonical `property/uniformity.json` artifact already publishes a statewide percentile alongside the governed Assessment Uniformity Score. Runtime exposes that existing percentile as `derived_governed`; it is not a raw NJ Division of Taxation field. Absecon district 0101 is the control.

## Chapter 123 Position

**Marker:** `watchdog.chapter123_position`

This is a screening position only. It uses current assessed value divided by an independent public-sales anchor: municipal verified-sales median PPSF multiplied by the matched subject's SR-1A living-space record. The result is compared with the official 2026 Chapter 123 lower and upper bounds. Output is `below_lower_bound`, `within_common_level_range`, or `above_upper_bound`. No result is returned when independent subject evidence or the official corridor is unavailable. It is not appeal eligibility, legal advice, an appraisal, or a value conclusion.

## Assessment Component Shift

**Marker:** `watchdog.njplus.assessment_component_shift`

Use only the latest pair of consecutive published MOD-IV years with both land and improvement assessments present, nonnegative, and a positive combined assessment. Compute component shares within land + improvement, then `differential_pp = change(land_share_pp) - change(improvement_share_pp)`. The mathematically possible differential is -200 to +200 percentage points, so `score = clamp(50 + differential_pp / 4, 0, 100)`, rounded to one decimal. 50 means unchanged composition; above 50 shifts toward land; below 50 shifts toward improvements. Missing years are never synthesized.

## Release gate

Formula governance may be staged before release, but provider coverage remains unpromoted until the production canary independently reproduces the values from governed source inputs and verifies `derived_governed` provenance.
