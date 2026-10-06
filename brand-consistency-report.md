# Watchdog Property Brand Consistency Audit

Generated from the repository tree. Authority: `property/branding/brand-system.json`.

## Coverage

- HTML pages scanned: **260**
- CSS files scanned: **286**
- JavaScript files scanned: **646**
- App/current-shell pages identified: **38**
- Distinct raw px font sizes: **70**
- Raw `font-size` declarations below 12px: **2013**
- Raw `font-size` declarations below 10px: **744**
- Files containing Source Sans 3: **91**

## Current-shell contract

Dashboard, Property Home, and supported secondary app pages must converge on the canonical Watchdog navigation, brand mark, typography, colors, focus treatment, and sizing layer. The legacy fixed/collapsible vertical sidenav remains prohibited.

Canonical app navigation:

1. Dashboard
1. Property Home
1. Town Compare
1. ROBUST Framework
1. Property Pulse
1. Agent Desk
1. Appeal Scanner
1. Data Workbench
1. Data Center
1. Plans & Pricing
1. Account

## Findings

- **CRITICAL** `property/home/index.html`: Property Home does not load the canonical brand consistency runtime.

## Highest concentrations of sub-12px CSS

| File | Declarations <12px |
| --- | ---: |
| `property/css/home.css` | 344 |
| `property/css/dashboard/dashboard.css` | 166 |
| `property/css/account-refresh-20260925.css` | 64 |
| `property/css/watchdog-intelligence-brand.css` | 46 |
| `property/branding/brand-center.css` | 36 |
| `property/css/app-shell-2027.css` | 30 |
| `property/css/integrations-outcome-intelligence.css` | 29 |
| `property/css/dashboard/05-collections.css` | 27 |
| `property/css/marketing-studio-production-workspace.css` | 25 |
| `property/css/integrations-outcome-capture.css` | 23 |
| `property/css/agent-paid-landing.css` | 22 |
| `property/css/integrations-automation-fabric.css` | 22 |
| `property/css/integrations-policy-feedback.css` | 22 |
| `property/css/shared/03-dashboard-components.css` | 22 |
| `property/css/compliance.css` | 21 |
| `property/css/dashboard/04-property-intelligence.css` | 21 |
| `property/css/data-center-2027.css` | 21 |
| `property/css/integrations-proof-explorer.css` | 21 |
| `property/css/integrations-tier3-verification.css` | 21 |
| `property/css/marketing-studio-wdd-composer-v2.css` | 21 |
| `property/css/intelligence-calibration.css` | 20 |
| `property/css/marker-intelligence.css` | 20 |
| `property/css/updates.css` | 19 |
| `property/css/dashboard/06-responsive-additions.css` | 18 |
| `property/css/intelligence-console.css` | 18 |

## Raw pixel type scale

5px (14), 6px (18), 6.5px (1), 6.8px (4), 7px (58), 7.5px (13), 7.6px (1), 7.8px (2), 8px (177), 8.2px (2), 8.5px (44), 8.7px (1), 8.8px (4), 9px (344), 9.2px (1), 9.3px (1), 9.5px (59), 10px (423), 10.5px (129), 11px (565), 11.5px (152), 12px (785), 12.5px (106), 13px (565), 13.5px (132), 14px (423), 14.5px (77), 15px (300), 15.5px (30), 16px (195), 16.5px (5), 17px (148), 17.5px (4), 18px (124), 19px (70), 20px (108), 21px (63), 22px (75), 23px (27), 24px (50), 25px (37), 26px (31), 27px (19), 28px (26), 29px (9), 30px (32), 31px (8), 32px (10), 33px (1), 34px (29), 36px (15), 38px (11), 39px (2), 40px (8), 42px (8), 43px (1), 44px (5), 45px (3), 46px (2), 48px (1), 50px (4), 52px (6), 53px (1), 54px (1), 57px (1), 58px (1), 62px (1), 64px (1), 78px (1), 210px (1)

## App/current-shell pages detected

- `property/account/index.html` → `account`
- `property/account/professional-profile/index.html` → `account`
- `property/account/profile/index.html` → `account`
- `property/agent-desk/index.html` → `agent-desk`
- `property/agent/contacts/index.html` → `agent-contacts`
- `property/branding/index.html` → `branding`
- `property/compliance/index.html` → `compliance`
- `property/dashboard/index.html` → `dashboard`
- `property/data-center/index.html` → `data-center`
- `property/data-workbench/index.html` → `data-workbench`
- `property/developer-data/index.html` → `developer-data`
- `property/fairness/index.html` → `fairness`
- `property/farm-builder/index.html` → `agent-desk`
- `property/farm-map/index.html` → `agent-desk`
- `property/growth/added-assessment-watch.html` → `growth`
- `property/growth/assessment-uniformity-watch.html` → `growth`
- `property/growth/index.html` → `growth`
- `property/growth/results.html` → `growth`
- `property/growth/revaluation-radar.html` → `growth`
- `property/growth/run.html` → `growth`
- `property/growth/senior-benefit-review.html` → `growth`
- `property/home/index.html` → `home`
- `property/integrations/index.html` → `integrations`
- `property/logs/data-center/index.html` → `data-center`
- `property/marker/index.html` → `marker`
- `property/market-list/index.html` → `agent-desk`
- `property/marketing-plan/index.html` → `growth`
- `property/marketing-studio/postcards/index.html` → `postcard-studio`
- `property/newsletter-studio/index.html` → `email-updates`
- `property/pro/index.html` → `pro`
- `property/pulse/index.html` → `pulse`
- `property/report-builder/index.html` → `reports`
- `property/robust/index.html` → `robust`
- `property/scan/index.html` → `scan`
- `property/town-compare/index.html` → `town-compare`
- `property/updates/index.html` → `updates`
- `property/verification-diagnostics/index.html` → `verification-diagnostics`
- `property/workbench/index.html` → `workbench`

## Interpretation

Raw font-size and legacy-font totals are debt metrics, not automatic rendered defects. Existing editorial exceptions, compact brand descriptors, migration shims, and historical CSS remain visible in the debt tables. Structural findings are reserved for current-shell contracts or source paths that can affect the effective user experience.

Critical findings: **1**. Effective structural warnings: **0**.
