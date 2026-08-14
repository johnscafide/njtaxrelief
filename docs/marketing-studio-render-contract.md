# Marketing Studio render contract v1

The browser remains the interactive Marketing Studio UI. Python is a deterministic rendering layer for high-quality previews, downloadable proofs and future provider handoff.

## Why this split

- Browser UI stays fast and responsive for editing.
- The same creative JSON can be rendered consistently outside the browser.
- Postcard/letter previews can later be converted to PNG/PDF without changing campaign data.
- PCM, Lob or another print provider can map from the approved Watchdog creative rather than owning Watchdog's authoring model.

## Creative payload

```json
{
  "template_key": "seller_value_postcard",
  "creative_type": "postcard",
  "content": {
    "headline": "Curious what your home could be worth?",
    "body": "Get a local property review based on current market information.",
    "cta": "Request your property review",
    "disclaimer": "Information is for marketing and educational purposes."
  },
  "brand": {
    "display_name": "Jane Agent",
    "company": "Example Realty",
    "phone": "555-555-0100",
    "email": "jane@example.com",
    "disclosure": "Equal Housing Opportunity."
  }
}
```

## Outputs

`property/scripts/render_marketing_creatives.py` accepts a single object or `{ "creatives": [...] }` and writes resolution-independent SVG assets plus `manifest.json`.

Postcard creatives produce:
- `<name>-front.svg`
- `<name>-back.svg`

Letter creatives produce:
- `<name>-letter.svg`

SVG is the v1 canonical rendered preview because it is resolution-independent, browser-safe and printable. PNG/PDF export can be layered on later without changing this contract.

## Approval boundary

Rendered previews are representations of the Watchdog creative. A provider proof remains a separate final approval artifact. No image render, browser preview or Python render may itself trigger provider spend.
