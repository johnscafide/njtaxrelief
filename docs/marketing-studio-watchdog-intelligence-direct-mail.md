# Watchdog Intelligence + Marketing Studio Direct Mail

## Product vision

Watchdog Intelligence should act as the campaign strategist and creative director inside Marketing Studio. PCM remains the print-production and postal fulfillment provider.

The target customer flow is:

1. Choose or create a governed property farm/audience.
2. Save the audience as a Marketing Studio campaign snapshot.
3. Choose a creative service level.
4. Watchdog Intelligence summarizes campaign-level evidence, profession, campaign goal and brand profile.
5. Generate one or more campaign creative directions.
6. Choose one concept and continue into the existing Customize / PCM design workflow.
7. Review the provider proof, recipients and authoritative price.
8. Approve and pay.
9. Submit to PCM only after all production gates pass.
10. Reconcile PCM order status and recipient tracking back into Watchdog.

This is designed to become an easy farm → design → approve → send experience without making AI the authority for postal mechanics, billing or property truth.

## Initial production format

The first Watchdog Direct Mail launch remains intentionally restricted to:

- 6 x 8.5 postcard
- First Class
- 50 valid-piece Watchdog customer minimum

PCM is the source of truth for final mechanical production specifications and proof. Watchdog may generate copy hierarchy, visual direction and provider-design mapping, but it must not invent bleed, trim, safe-zone, barcode or indicia dimensions.

## Creative service levels

Creative service pricing is server-owned and is separate from PCM vendor production cost.

### Smart

- Included creative service fee: $0
- Agent or higher
- One concept
- Campaign goal + brand + curated Watchdog template
- Fastest path
- No Intelligence-directed positioning required

### Signature

- Initial creative service fee: $29 per campaign
- Pro or higher
- Three concepts
- Watchdog Intelligence campaign brief
- Governed campaign/farm-level evidence summary
- Profession- and goal-aware copy direction
- Custom visual direction

### Studio

- Initial creative service fee: $79 per campaign
- Pro or higher
- Five concepts
- Premium Watchdog Intelligence campaign brief
- Stronger creative differentiation and hierarchy
- Custom visual-concept prompts are eligible
- Actual generated artwork remains feature-gated until the provider asset/embedded-editor workflow is certified

These are initial product-price recommendations and can be changed in `marketing_creative_service_tiers` without changing PCM pricing.

## Intelligence contract

Watchdog Marketing Intelligence uses campaign-level context, not private recipient profiling.

Allowed inputs include:

- Watchdog user's profession
- saved brand profile
- campaign goal
- immutable audience/farm snapshot
- aggregate qualification summary
- governed property Intelligence findings associated with the selected farm
- aggregate finding type mix
- aggregate confidence and evidence coverage
- aggregate governed signal prevalence
- curated Watchdog template catalog
- user-supplied creative direction

The generated campaign brief and variants preserve a facts hash plus source Intelligence run/finding IDs for auditability.

## Housing-marketing guardrails

Creative generation must not:

- target, include or exclude using protected characteristics
- infer or target race, ethnicity, religion, disability, familial status, national origin, sex, gender, sexual orientation, pregnancy or similar protected/sensitive attributes
- infer private life events such as health, divorce or death
- predict or claim that a homeowner is likely to sell
- label an owner as motivated, distressed or desperate
- infer foreclosure likelihood as a personal propensity
- guarantee property values, tax savings, appeal outcomes, lending outcomes, sale prices, timing, profit or response rates
- invent recipient-specific facts that are absent from the governed campaign contract

Intelligence can instead produce statements such as a farm-level campaign theme derived from governed public property facts and calibrated Watchdog findings.

## Persistence

### `marketing_creative_service_tiers`

Server-owned creative pricing, entitlements and output depth.

### `marketing_intelligence_creative_briefs`

Stores:

- user + campaign
- audience snapshot
- creative tier
- profession + goal
- aggregate campaign count
- source Intelligence finding IDs
- source Intelligence run IDs
- sanitized campaign input manifest
- campaign brief
- generated variants
- facts hash
- provider/model/token metadata

Browser users can read only their own briefs. Writes are service-owned.

## Runtime API

The existing authenticated `marketing-direct-mail-launch` Edge Function also exposes the creative actions so Watchdog does not require another Supabase function slot.

### `creative.generate`

Builds and stores a campaign brief and 1/3/5 creative concepts. It uses deterministic curated-template output if the optional prose provider is unavailable.

### `creative.latest`

Returns the most recent owned campaign creative brief.

### `creative.select`

Turns a selected concept into a real `marketing_creatives` draft and carries the Intelligence brief lineage into the creative version.

### `launch`

The existing production path remains separate. Creative generation never enables production spend or bypasses proof, payment, approval or PCM launch gates.

## Pricing boundary

`marketing_direct_mail_product_quote` now separates:

- PCM vendor cost
- Watchdog print retail
- Watchdog creative service fee
- customer retail total
- total Watchdog gross margin

A higher creative tier therefore costs more without altering the recorded PCM production cost.

## Custom artwork roadmap

Studio is eligible for custom generated visual concepts, but actual generated artwork should stay feature-gated until the PCM editor/asset contract is certified.

The desired eventual workflow is:

1. Intelligence generates a visual concept prompt based only on approved campaign-level context.
2. Watchdog generates or selects an appropriate non-personal visual asset.
3. Asset is placed into a PCM-certified design slot/template.
4. PCM returns/refreshes the authoritative proof.
5. User approves the actual PCM proof before payment/launch.

Do not make a Watchdog-rendered preview equivalent to a production proof.

## One-click orchestration roadmap

A future "Build this campaign" action can orchestrate existing steps while preserving explicit approval boundaries:

- materialize farm
- create immutable campaign snapshot
- run/collect relevant governed Intelligence
- choose recommended campaign goal
- generate creative tier concepts
- prepare valid recipients
- select/create PCM provider design
- obtain proof
- quote

The final payment and provider submission should still require an explicit customer confirmation. "One click" should remove setup work, not silently spend money or send mail.
