# Watchdog Intelligence Brand Standard

**Status:** Authoritative sub-brand supplement  
**Parent system:** `/property/branding/brand-system.json`  
**Machine spec:** `/property/branding/intelligence-brand.json`  
**Implementation CSS:** `/property/css/watchdog-intelligence-brand.css`  
**Effective:** 2026-08-23

## Purpose

Watchdog Intelligence is the governed intelligence layer inside Watchdog Property Intelligence. It is not a replacement for the Watchdog master brand and it is not a generic AI badge.

Use this standard anywhere Watchdog Intelligence is marketed, compared, explained, or represented as a product capability.

## Canonical visual signature

The Watchdog Intelligence signature uses this four-stop gradient:

1. Watchdog blue: `#2f6df6`
2. Violet: `#6c5ce7`
3. Magenta: `#d760b5`
4. Teal: `#08a6a7`

CSS reference:

```css
linear-gradient(115deg,#2f6df6,#6c5ce7,#d760b5,#08a6a7)
```

### Required usage

Whenever a marketing or product-information surface explicitly names **Watchdog Intelligence**, use at least one of these treatments:

- render the word **Intelligence** in the Intelligence gradient; or
- place the Intelligence section, feature card, promotion, or major callout inside a restrained 1px Intelligence gradient border.

For important standalone Intelligence callouts, using both the gradient word and the gradient border is preferred.

This requirement applies to public pricing, plan comparison, account/billing explanations, feature marketing, launch pages, internal brand examples, and future product collateral.

### Restraint

The Intelligence gradient is a sub-brand identifier, not a general decorative palette.

Do not:

- turn ordinary Watchdog navigation, tables, dashboards, or charts into rainbow UI;
- use the gradient as a semantic risk or status color;
- place long body copy in gradient text;
- replace the master Watchdog blue/navy identity with the Intelligence gradient;
- add unrelated glow effects merely because a surface mentions AI or automation.

Generic Watchdog product UI continues to follow the parent brand system. The Intelligence signature appears when the Intelligence capability itself needs recognition.

## Accessibility and fallback

Gradient text must remain legible against its background. If background-clip text is unsupported, contrast is uncertain, or the treatment becomes visually noisy, render the word in canonical Watchdog ink `#111d38` and preserve the Intelligence gradient border on the containing surface.

Never rely on gradient color alone to communicate entitlement, success, risk, source confidence, or model status. Use words and icons with the existing semantic color system.

## Naming

Preferred names:

- **Watchdog Intelligence** for the governed intelligence platform/capability layer.
- **Watchdog Analyst** for the conversational analyst experience where that product name is specifically intended.
- **Watchdog Intelligence Voice** when the voice capability needs its full name.
- **Voice** is acceptable inside an already established Watchdog Intelligence context.

Avoid treating “AI” as the primary product name when the capability is Watchdog Intelligence.

## Voice relationship

Voice is a capability of Watchdog Intelligence, not a separate audio SKU.

Packaging language:

- Free / Standard: unavailable.
- Agent: unlocked through Watchdog Intelligence entitlement/add-on.
- Pro: unlocked through Watchdog Intelligence entitlement/add-on.
- Pro+: included with Watchdog Intelligence.
- Teams: included with Watchdog Intelligence where Teams is available.

Voice input and spoken briefs must preserve the same authorization, evidence, source, entitlement, and audit controls as typed Watchdog Intelligence. Written evidence remains authoritative.

## Watchdog Score and ROBUST

The product remains **Watchdog Score**. The score is powered by the **ROBUST Framework**.

Preferred public language:

> **The Watchdog Score is powered by the ROBUST Framework.**

> **One score. Six dimensions. ROBUST.**

The six canonical dimensions and current framework weights are:

- **R — Recourse — 10%**
- **O — Overassessment Position — 20%**
- **B — Burden — 30%**
- **U — Uniformity — 15%**
- **S — Stability — 15%**
- **T — Trajectory — 10%**

Do not rename the product “ROBUST Score.” ROBUST explains the Watchdog Score.

## Representative product imagery

Marketing screenshots may combine real Watchdog assets and representative product compositions when a literal screenshot would be stale, contain user-specific data, or fail to communicate the current product clearly.

Rules:

- use current Watchdog navigation, typography, spacing, colors, and feature names;
- use real or clearly representative property imagery and never imply a sample image is a specific property unless it is;
- do not fabricate unavailable product capabilities;
- sample data must be obviously representative and should not be presented as a live user record;
- wherever an Intelligence composite appears, preserve the Intelligence visual signature above.

## Implementation references

Use these classes instead of recreating the treatment on each page:

- `.wd-intelligence-word` — gradient word treatment.
- `.wd-intelligence-surface` — light surface with 1px Intelligence border.
- `.wd-intelligence-surface-dark` — dark surface with 1px Intelligence border.

Source: `/property/css/watchdog-intelligence-brand.css`.
