# The Watchdog Score
## The ROBUST Framework for governed 0–100 property position, evidence, change, and place-level decision intelligence

**Version:** 0.2  
**Date:** August 22, 2026  
**Status:** Living product, methodology, governance, brand, and research document  
**Canonical scope:** Watchdog Score, the ROBUST Framework, Watchdog-derived markers, evidence coverage, geographic score architecture, longitudinal scoring, public interpretation, and 5–10 year product direction  
**Related roadmap:** Linear NJW-102, NJW-106, NJW-144, NJW-192, NJW-208, NJW-210, NJW-249, NJW-270 and future score-governance work

> **Core thesis:** The Watchdog Score should become a common language for understanding how a New Jersey property or place sits within a defined, evidence-backed context at a defined point in time. The **ROBUST Framework** is the branded six-dimension methodology beneath that score: **Recourse, Overassessment Position, Burden, Uniformity, Stability, and Trajectory**. The score is not a grade on a home, a family, a neighborhood, a municipality, a county, or a government. It is a compact signal that makes complex public-record relationships easier to see, compare, investigate, monitor, and act on.

> **Brand standard:** **Watchdog Score** is the product and public result. **ROBUST Framework** is the official branded methodology and explanatory system underneath it. The preferred public phrase is **“The Watchdog Score, powered by the ROBUST Framework.”** Do not casually rename the product “ROBUST Score.”

---

## 1. Executive summary

The Watchdog Score is intended to become one of Watchdog's most recognizable products and, over time, one of its most useful pieces of public infrastructure.

The long-term opportunity is larger than putting a number beside a property address.

A trusted score can create a common analytical grammar across:

- an individual property;
- a municipality, including boroughs, cities, towns, townships, and villages;
- a county;
- the State of New Jersey;
- a saved property portfolio;
- a professional farm or territory;
- a historical period;
- and eventually a policy or scenario comparison.

The score should make complicated relationships understandable without pretending those relationships are simple.

That distinction matters.

A Watchdog Score of 38 should not mean that a house is bad, that a town is undesirable, that local officials failed, or that a resident made a poor decision. It should mean that, under a named Watchdog model and reference frame, the measured subject currently exhibits a more pressured combination of the conditions the model was designed to measure. The user should immediately be able to see the factors responsible for that result.

Likewise, a Watchdog Score of 82 should not mean that a property is a superior home, that a municipality is a superior community, or that an investment is guaranteed to perform well. It means the measured conditions are currently favorable under that model.

The score is therefore best understood as a **decision-orientation system**, not a verdict system.

Its job is to answer five questions quickly:

1. **Where does this subject stand?**
2. **Compared with what?**
3. **Why is it there?**
4. **How confident are we in the evidence?**
5. **What deserves attention next?**

The current property-level Watchdog Score already demonstrates this idea. Its implemented model combines six tax-position components into a 0–100 composite. Those six dimensions are now officially branded as the **ROBUST Framework**.

| ROBUST | Official dimension | Current weight | Question it helps answer |
| --- | --- | ---: | --- |
| **R** | **Recourse** | 10% | What does the available appeal and correction context suggest about practical recourse? |
| **O** | **Overassessment Position** | 20% | How does the assessment sit against supported value and the Chapter 123 framework? |
| **B** | **Burden** | 30% | How heavy is the current property-tax burden relative to estimated market value? |
| **U** | **Uniformity** | 15% | How consistently does the municipality assess properties? |
| **S** | **Stability** | 15% | How much evidence of assessment-reset or revaluation pressure is present? |
| **T** | **Trajectory** | 10% | Is the property's assessment relationship moving in step with verified market evidence? |

The underlying weights have **not** changed merely because the methodology has been branded. The former internal/public label **Assessment fairness** maps to **O — Overassessment Position**. “Overassessment Position” is intentionally a neutral measurement label. It describes where the assessment sits relative to supported evidence; it does **not** presume that a property is legally or factually overassessed.

The simplest public explanation is:

> **One score. Six dimensions. ROBUST.**

Or, where more context is useful:

> **Every Watchdog Score is explained through ROBUST: Recourse, Overassessment Position, Burden, Uniformity, Stability, and Trajectory.**

When one of these components is unavailable, the current implementation does not invent a neutral value. It drops the missing component and renormalizes the available weights. It separately reports evidence coverage. That principle is more important than any single weighting scheme and should survive future model versions.

This paper recommends that Watchdog formalize a durable **Score Constitution** around that idea.

The formulas can evolve. Sources can improve. New markers can be validated. Geographic models can be added. The constitutional rules should remain stable:

- define what is being measured;
- identify the comparison frame;
- expose the ROBUST drivers;
- preserve the evidence chain;
- version the model;
- separate score from confidence;
- distinguish level from direction;
- do not silently manufacture missing evidence;
- test sensitivity to methodological choices;
- never tune the score to produce a preferred political, commercial, or geographic result;
- avoid protected-class and demographic proxies in the core score;
- do not turn a score into an automatic legal, lending, insurance, housing-eligibility, or other high-stakes determination;
- and allow the score to say **insufficient evidence** when that is the most accurate answer.

If Watchdog follows those rules, the Watchdog Score can grow from a useful property-tax signal into a statewide measurement system that helps people decide what deserves their attention, understand why conditions changed, and discuss policy with more shared evidence.

The 5–10 year ambition is straightforward:

> **Every New Jersey property and every New Jersey taxing jurisdiction should be understandable through the same Watchdog Score language and the same recognizable ROBUST dimensions, while every score remains traceable to the evidence, model, geography, and moment that produced it.**

---

## 2. Why a score at all?

Property information is fragmented by design.

An owner can find an assessment in one place, a tax rate in another, a deed or sale record elsewhere, appeal statistics in another state file, permit activity from a different agency, flood or environmental information from spatial services, and municipal fiscal context in yet another source.

Each field can be accurate while the overall decision remains difficult.

Humans do not naturally reason from hundreds of independent columns. They look for patterns, exceptions, direction, and priority.

The purpose of the Watchdog Score is to compress a defined set of those relationships into a signal that is easy to understand at a glance **without destroying the underlying detail**.

That last condition is the difference between a useful composite indicator and a black box.

The OECD and European Commission's *Handbook on Constructing Composite Indicators* describes why composite indicators can be useful for policy communication while also warning that indicator selection, normalization, missing-data treatment, weighting, and aggregation all involve choices that can materially change the result. The handbook therefore recommends uncertainty and sensitivity analysis so that the user can understand how robust a composite result is to those choices.

Watchdog should adopt the same discipline. The name **ROBUST** should be treated as a methodological commitment, not a marketing boast. If Watchdog says its framework is robust, the model must be tested for robustness.

The score is valuable because it reduces cognitive load. It becomes trustworthy only when the user can take it apart.

### 2.1 The marketing value of a common language

A successful score becomes memorable when users do not need a manual to understand its basic shape.

Walk Score provides a useful market analogy. Walk Score gives an address a 0–100 walkability measure, exposes a published methodology, provides APIs and widgets, can be added to property listings, and is used for search, sorting, research, planning, real estate, finance, and public-health analysis. Its stated vision is that property listings should include the score alongside basic property facts such as beds and baths.

The lesson for Watchdog is not to copy the Walk Score methodology. The measured concepts are completely different.

The lesson is distribution:

> A useful, recognizable, documented score can become a standard piece of information that travels with a property.

The future listing line could be as familiar as:

**3 beds · 2 baths · $9,842 taxes · Watchdog Score 72**

The next tap or hover can expose the six ROBUST dimensions.

Watchdog should also expose at least three summary dimensions wherever space permits:

**Watchdog Score 72 · Confidence 91 · Momentum +4**

The first number describes current position. The second describes evidence sufficiency. The third describes change in the headline score over time.

**Momentum is not the same thing as T — Trajectory.** Trajectory is one ROBUST component measuring the direction of underlying assessment/value relationships inside the score. Momentum describes the change in the headline Watchdog Score itself over a stated period.

That combination can become far more useful than a naked rating.

---

## 3. What the Watchdog Score is, and what it is not

### 3.1 A formal definition

The Watchdog Score is:

> **A bounded, versioned, evidence-backed composite measure of how a defined property or geographic subject sits relative to a defined reference framework at a defined point in time, explained through the ROBUST Framework.**

Every word matters.

**Bounded** means the public score uses a consistent 0–100 presentation range.

**Versioned** means the formula, weights, thresholds, source requirements, and cohort definitions are identifiable and cannot silently change historical meaning.

**Evidence-backed** means the result must be produced from governed source facts or governed Watchdog-derived markers whose dependencies and transformations are known.

**Composite** means the score intentionally summarizes multiple dimensions rather than pretending one field represents the whole condition.

**Defined subject** means the score always belongs to a declared scope, such as property, municipality, county, or state.

**Reference framework** means a score is meaningless without knowing what it is compared with or how its normalization anchors were established.

**Point in time** means the score is an observation, not an eternal property characteristic.

**Explained through ROBUST** means the user should be able to understand the result through Recourse, Overassessment Position, Burden, Uniformity, Stability, and Trajectory rather than being handed an opaque number.

### 3.2 It is not a desirability score

The Watchdog Score must never be marketed as a universal answer to questions such as:

- Is this a good house?
- Is this a good neighborhood?
- Is this a good town?
- Is this a safe place?
- Is this a good school district?
- Should this person buy here?
- Should a lender approve this borrower?
- Should an insurer cover this property?
- Is this municipality well governed?
- Should someone vote for or against a candidate?

Those questions either depend on factors outside the model, depend heavily on individual preference, or require legal and professional judgments that a composite score should not make.

AARP's Livability Index provides a useful precedent. Its 0–100 score spans neighborhoods, cities, counties, and states, yet AARP explicitly explains that a lower score does not make a community “unlivable.” A lower result can identify challenges and opportunities for improvement, while individual preferences still matter.

Watchdog should use an even narrower interpretation because its core evidence is property, tax, assessment, fiscal, transaction, permit, and public-record intelligence rather than a general quality-of-life survey.

### 3.3 It is a priority signal

A score should help someone know where to look next.

Examples:

- A homeowner sees that **B — Burden** and **O — Overassessment Position** are the largest downward drivers and opens the evidence behind those components.
- A buyer sees favorable Burden but negative Momentum caused by rising **S — Stability** pressure and plans for a higher future carrying-cost scenario.
- An agent sees that a property's overall score is ordinary but its **T — Trajectory** is unusual and prepares for that buyer conversation.
- An attorney filters a portfolio to lower-scoring properties with high evidence coverage and strong **R — Recourse** markers.
- A municipal professional sees that the municipality's aggregate score changed little, but **U — Uniformity** widened sharply, suggesting that the assessment roll deserves investigation.
- A journalist sees a county score improve while one ROBUST dimension worsens and reports the trade-off rather than reducing the story to a league table.

In each example, the score begins the inquiry. ROBUST explains the structure. The evidence explains the result.

---

## 4. The current property Watchdog Score and the ROBUST Framework

The current production product contains a real, implemented property-level composite in `property/js/dashboard/tools/watchdog-score.js`.

Its purpose is deliberately narrower than the future score family. It measures a property primarily as a **New Jersey property-tax position**.

Beginning with this whitepaper version, the six current component concepts are officially branded as the **ROBUST Framework**.

This is a **brand and methodology naming decision, not a formula change**. Existing production code may still use legacy internal names such as `fairness`. That implementation terminology should migrate carefully through NJW-270 and related score-governance work. Until then, the public methodology maps those internal concepts to the ROBUST names below.

### 4.1 The ROBUST formula

Let each available component be normalized to the interval 0–1:

- **R** = Recourse
- **O** = Overassessment Position
- **B** = Burden
- **U** = Uniformity
- **S** = Stability
- **T** = Trajectory

The full-evidence score is conceptually:

```text
Watchdog Score = 100 × (
    0.10R +
    0.20O +
    0.30B +
    0.15U +
    0.15S +
    0.10T
)
```

This is mathematically equivalent to the current six-component production weighting. The ordering has changed only so the methodology reads as **ROBUST**.

When components are missing, the available weights are renormalized:

```text
Watchdog Score = 100 × Σ(wᵢ × xᵢ) / Σ(wᵢ for available ROBUST components)
```

Current evidence coverage is:

```text
Evidence Coverage = Σ(available ROBUST component weights) / 100
```

The current implementation reports:

- high confidence at 85% or more coverage;
- medium confidence at 60% to less than 85%;
- low confidence below 60%.

Those thresholds should be treated as the current product contract, not as scientifically permanent constants. Future validation should test whether different minimums are warranted for different uses.

### 4.2 R — Recourse, 10%

Recourse asks what the available appeal and correction context suggests about practical avenues for review.

The current score uses county appeal outcomes as contextual evidence about recourse.

This component deserves continuing research. Historical county win rates are not individual probabilities. They may reflect which taxpayers filed, what evidence they brought, property mix, settlement behavior, procedural differences, and changing conditions.

The right long-term use is contextual, calibrated, and modest. It should never be shown as a promise that a specific appeal will succeed.

### 4.3 O — Overassessment Position, 20%

Overassessment Position is the official ROBUST name for the current assessment-fairness concept.

It compares the assessment with supported value and the Chapter 123 framework where the property is testable.

The word **Position** is essential. This dimension does not begin with an assumption that a property is overassessed. A property can occupy a favorable, typical, mixed, or pressured position. “Overassessment” names the risk relationship users care about; “Position” keeps the construct neutral and evidence-based.

New Jersey's Division of Taxation publishes the common level range for each taxing district. The range is based on the district average ratio and extends 15% above and below that average. The state also makes clear that a taxpayer challenging an assessment must prove that the assessed value is unreasonable under the relevant market-value or common-level-range standard.

Watchdog can use these official relationships as evidence. It must not imply that its screening calculation itself determines an appeal outcome or legally establishes overassessment.

### 4.4 B — Burden, 30%

Burden asks how much property tax is being carried relative to the property's estimated market value.

This deserves the largest current weight because it represents the recurring expense experienced by the taxpayer rather than an abstract assessment relationship.

The current score code uses fixed burden anchors rather than calculating percentiles from a small, self-selected Watchdog user sample. That is directionally sound. A product should not call something “average for New Jersey” merely because it is average among the properties its current users happened to save.

Long term, the burden normalization should be governed from statewide evidence, versioned, and periodically validated against the current distribution of equalized property values and taxes.

### 4.5 U — Uniformity, 15%

Uniformity describes how consistently the municipality assesses properties.

The coefficient of deviation provides context about how widely assessment-to-sale ratios vary in a taxing district.

The New Jersey Division of Taxation publishes general, stratified, and segmented coefficients of deviation. The state's assessor materials explain the basic interpretation: greater deviation generally indicates poorer assessment uniformity, while lower deviation indicates better uniformity.

This is valuable because an individual property exists inside an assessment system. Two otherwise similar properties can face different uncertainty depending on the consistency of the roll around them.

Uniformity is therefore not a judgment about whether a town is good or bad. It is evidence about the consistency of one public valuation process.

### 4.6 S — Stability, 15%

Stability incorporates Watchdog's governed revaluation-pressure work.

The current derived registry uses official Chapter 123 ratio context, verified-sale assessment-ratio drift, and residential COD pressure when available. The model intentionally treats COD as optional and renormalizes the remaining inputs when it is unavailable.

New Jersey itself identifies assessment-sales ratios, coefficients of deviation, sales outside the common-level range, changes in property characteristics, timing of the last revaluation, record accuracy, appeals, and economic changes as factors relevant to revaluation need.

Watchdog's marker is therefore a **screening model for pressure**, not a prediction that a municipality will order or complete a revaluation on a specific date.

### 4.7 T — Trajectory, 10%

Trajectory asks whether a property's assessment relationship is keeping pace with verified market evidence relative to its municipal context.

This is important because a low current assessment is not automatically a permanently favorable condition. If a sale or broader assessment pattern suggests a future reset exposure, that uncertainty belongs in a forward-looking tax-position score.

This component also demonstrates why score interpretation should never be reduced to “high good, low bad.” A temporarily low assessment can reduce today's bill while increasing future uncertainty. The score needs to recognize trade-offs.

### 4.8 Why ROBUST works as a brand standard

ROBUST is useful because the word describes how the methodology should be constructed rather than how a property should be judged.

It does **not** say that a property is “robust.” It says Watchdog intends the score framework to be robust: multi-dimensional, evidence-backed, versioned, explainable, sensitivity-tested, and resistant to one-factor conclusions.

That distinction should remain part of the brand.

Preferred language:

> **The Watchdog Score is powered by the ROBUST Framework.**

> **One score. Six dimensions. ROBUST.**

> **ROBUST explains the number: Recourse, Overassessment Position, Burden, Uniformity, Stability, and Trajectory.**

Avoid language that turns ROBUST into a quality label for the home or community, such as “This is a ROBUST property.”

---

## 5. Markers are the DNA of the score

The Watchdog Score should not become one giant formula that absorbs every field Watchdog owns.

The better architecture is hierarchical:

```text
Authoritative source facts
        ↓
Normalized source fields
        ↓
Governed derived markers
        ↓
ROBUST component scores
        ↓
Watchdog Score
        ↓
Confidence + Momentum
        ↓
Explanation, change, and action
```

This allows Watchdog to improve individual parts without turning the whole system into an opaque model.

### 5.1 Four evidence classes

Watchdog's broader data methodology distinguishes four useful concepts:

1. **Authoritative source facts**  
   Published government or other governed source observations such as assessment, annual tax, parcel identity, verified sale data, tax rates, permits, and spatial records.

2. **Normalized source fields**  
   Stable Watchdog field names that preserve the meaning and lineage of the original source field.

3. **Watchdog-derived markers**  
   Calculations such as ratios, completeness measures, pressure scores, trend measures, opportunity screens, and evidence-strength measures.

4. **Screening signals**  
   Derived outputs intended to prioritize review rather than state a legal, appraisal, insurance, investment, or transaction conclusion.

The marker library should remain broader than the top-level Watchdog Score.

A user may care about `watchdog.appeal_evidence_strength` even when it has modest influence on R — Recourse. An appraiser may care about comparable-evidence reliability. An investor may care about carry-cost volatility. A buyer may care about tax-reset exposure. A title professional may care about permit and public-record exceptions.

These markers are not competitors to the Watchdog Score. They are the detailed vocabulary beneath ROBUST.

### 5.2 Current marker governance foundation

Production includes a dedicated `derived_formula_registry` with engine versions, formulas, dependencies, confidence, status, explanations, operations, and configuration. The repository's formula catalog also states a principle that should remain permanent Watchdog doctrine:

> Every proprietary score exposes its component inputs or formula, and scores support prioritization rather than legal, appraisal, credit, investment, insurance, or transaction outcomes.

That is the correct foundation.

### 5.3 A marker should be independently intelligible

Every derived marker used in a ROBUST dimension should be able to answer:

- What does this marker measure?
- Which ROBUST dimension does it support, if any?
- What direction is favorable, pressured, or simply different?
- What is the unit or bounded range?
- Which facts does it depend on?
- What is the formula or transformation?
- Which source versions supplied the dependencies?
- What happens when an input is missing?
- What scope does it belong to?
- What population or baseline does it use?
- How fresh is it?
- Is it source-preserving, derived, modeled, or estimated?
- What is it not intended to conclude?

If a marker cannot answer those questions, it should not quietly become part of the flagship score.

---

## 6. The Watchdog Score Constitution

The following rules should govern every future model that carries the **Watchdog Score** name and every implementation that claims to use the **ROBUST Framework**.

### Rule 1: Define the construct before choosing the data

A score must start with the question it is designed to answer.

The current property score asks about tax position. A future municipal score may ask about the health, fairness, stability, and trajectory of the local property-tax environment. Those are related constructs, but they are not identical.

Watchdog should not add a marker simply because the data exists.

### Rule 2: No naked score

Every score must have an accessible explanation containing at least:

- scope;
- model version;
- observation or computation time;
- evidence coverage;
- confidence band;
- ROBUST component values;
- top positive and negative drivers;
- missing important inputs;
- reference cohort or normalization basis;
- and a path to the underlying marker/source evidence.

A compact badge can show only the number. One click or tap must reveal its ROBUST DNA.

### Rule 3: One canonical named score per scope and version

The Watchdog brand cannot tolerate unrelated calculations being displayed under the same name.

A real example already demonstrates this risk. A legacy search-card experiment generated a `peer-gap-v1` number from local assessed-value medians and persisted those results in a public score cache. Linear NJW-102 documented that near-identical homes could receive dramatically inconsistent values and concluded that the calculation was not the real Watchdog Score. The true product score remained the six-component composite described above.

This incident should become a permanent governance lesson:

> **A prototype, fallback, heuristic, or experimental ranking may never use the unqualified Watchdog Score name or ROBUST branding unless it passes the canonical score contract.**

Legacy score versions must be deprecated explicitly, not allowed to coexist behind the same label.

### Rule 4: Same inputs plus same version must reproduce the same result

The score is primarily deterministic.

Generative AI may explain a score, answer questions about it, or help users explore scenarios. It should not secretly change the deterministic score based on prose, tone, or a model's subjective judgment.

Linear NJW-192 already established this principle for Watchdog Intelligence: the same governed inputs and model version should reproduce the same analytical result, with stored evidence and lineage.

### Rule 5: Missing evidence is information

Missingness must never be silently treated as a favorable or unfavorable fact unless a published formula explicitly defines that behavior.

Current property scoring renormalizes available components rather than filling missing values with an invented neutral score.

That approach should be strengthened with a **minimum evidence gate**.

There are situations where Watchdog should return:

```text
Watchdog Score: Insufficient evidence
Coverage: 42%
ROBUST missing: O, U, R
Missing evidence: verified sale context, municipal uniformity, appeal context
```

That response is better for the brand than a precise-looking number built on weak evidence.

### Rule 6: Score and confidence are separate

A property can have a score of 72 with high confidence and another can have 72 with low confidence. They should not be presented as equivalent observations.

Confidence should be derived from evidence coverage, source authority, recency, and model-specific sufficiency rules. It should not be an AI model saying that it “feels 91% confident.”

### Rule 7: Level and direction are separate

The number describes current position. It does not adequately describe change.

Watchdog should standardize a companion metric:

**Watchdog Momentum**

Examples:

```text
Score 72 | Confidence 91 | Momentum +4 over 12 months
Score 72 | Confidence 91 | Momentum -7 over 12 months
```

Those two properties have the same current score and very different stories.

Momentum must remain distinct from T — Trajectory, which is an input dimension rather than the headline score's own change history.

### Rule 8: The comparison frame must be named

A percentile or normalized score can change when the comparison population changes.

A property compared with all New Jersey residential parcels may have a different position than the same property compared only with similar property classes in the same municipality.

Watchdog should store and expose cohort definitions and versions. Historical scores should not silently change because a cohort was redefined.

### Rule 9: Similar scores should not imply false precision

Composite-indicator research repeatedly warns against treating small score differences as meaningful when the underlying model is sensitive to weighting and normalization choices.

A 71 and a 72 should not be marketed as if the second property is objectively superior.

Watchdog should emphasize bands, ROBUST driver differences, confidence, and material movement rather than leaderboard theatrics.

### Rule 10: Weight changes require sensitivity testing

Before a weighting or normalization change becomes canonical, Watchdog should test:

- rank stability;
- score-band migration;
- ROBUST component influence;
- county and municipal effects;
- property-class effects;
- missing-data effects;
- outlier sensitivity;
- whether one component dominates unexpectedly;
- and whether specific jurisdictions are systematically advantaged or disadvantaged by a methodological choice.

The OECD/JRC composite-indicator handbook specifically recommends testing inclusion/exclusion, imputation, normalization, weighting, and aggregation choices.

### Rule 11: No political tuning

A score methodology must never be changed because an elected official, political party, municipality, advertiser, customer, advocacy group, or Watchdog employee prefers the resulting number.

A method may change because:

- better evidence became available;
- a source definition changed;
- validation exposed a bias or defect;
- a component no longer measures the intended construct;
- a model became more robust;
- or an independent review recommends improvement.

The reason, impact analysis, effective date, and version change should be published.

### Rule 12: The core score must not become a demographic desirability proxy

The core Watchdog Score should remain anchored in property, assessment, tax, public-record, fiscal, market-evidence, and system-quality conditions.

Protected personal characteristics should not be inputs to ROBUST. Nor should Watchdog intentionally engineer proxies whose purpose is to recreate protected characteristics.

The Fair Housing Act prohibits discrimination in housing-related activities based on race, color, national origin, religion, sex, familial status, and disability. As Watchdog becomes more deeply integrated into brokerage, marketing, lending, and other housing workflows, the safest score architecture is one that measures property and public-system conditions rather than the identity of the people who live in a place.

### Rule 13: A score does not make the high-stakes decision

The Watchdog Score may help prioritize investigation. It should not, by itself:

- approve or deny credit;
- set mortgage terms;
- approve or deny insurance;
- determine legal rights;
- determine an assessment appeal;
- determine housing eligibility;
- automatically steer a person toward or away from a community;
- determine whether a government receives resources;
- or replace professional judgment.

The more consequential a use becomes, the stronger the human review, validation, documentation, and context requirements should become.

### Rule 14: Every score needs a correction path

If a source fact is wrong, stale, mismatched, or later corrected, the user should be able to challenge the evidence.

Watchdog should distinguish:

- source correction needed;
- parcel matching error;
- stale source version;
- formula/model defect;
- reasonable disagreement about interpretation;
- and personal preference that is simply outside the score's scope.

### Rule 15: Historical score observations are immutable records of what Watchdog knew then

If a model changes, Watchdog may offer restated historical series under the new model, but it should not overwrite the old observation as though the original score never existed.

A historical observation should retain:

- score;
- model version;
- ROBUST component values and weights;
- formula version;
- evidence coverage;
- input snapshot or reproducible evidence manifest;
- cohort version;
- computation time;
- and source vintages.

This is already directionally supported by Watchdog's `score_observations` model and broader versioned Intelligence architecture.

### Rule 16: ROBUST is a protected methodology label

Any Watchdog surface using the word **ROBUST** must refer to the governed framework defined here or to a formally versioned successor.

The brand should not use ROBUST as a decorative adjective for unrelated features, plans, or marketing copy. That discipline preserves the term's meaning.

---

## 7. The geographic score system

The long-term user experience should be simple:

> **Property. Municipality. County. State. One Watchdog language. One recognizable ROBUST framework.**

The underlying mathematics should not be simplistic.

### 7.1 One scale, different scopes

Watchdog should use a shared 0–100 presentation grammar while clearly labeling scope:

- **Property Watchdog Score**
- **Municipal Watchdog Score**
- **County Watchdog Score**
- **New Jersey Watchdog Score**

A municipality's 67 and a property's 67 should not be interpreted as the same calculation. The common number range and ROBUST letters help people learn the product. The scope label, marker set, normalization, and weights preserve meaning.

### 7.2 ROBUST across geography

The preferred long-range architecture is that all geographic Watchdog Scores continue to explain themselves through the same six top-level dimensions:

- **R — Recourse**
- **O — Overassessment Position**
- **B — Burden**
- **U — Uniformity**
- **S — Stability**
- **T — Trajectory**

The underlying markers and weights can differ by scope.

For example:

- Property O can measure the subject parcel's assessment position.
- Municipal O can measure the distribution of parcel-level assessment positions and the prevalence or severity of overassessment pressure.
- County O can summarize distribution-aware municipal and parcel evidence without pretending county government caused those conditions.
- State O can summarize statewide assessment-position distribution.

The same principle can apply to the other ROBUST dimensions.

This creates a powerful public language without requiring a naive shared formula.

### 7.3 Town, township, borough, city, village

For product architecture, Watchdog should use **municipality/taxing district** as the common analytic level while displaying the legal form people recognize.

That lets a user see:

- Gloucester Township Watchdog Score;
- Haddonfield Borough Watchdog Score;
- Camden City Watchdog Score;
- and other municipal forms

without creating a different statistical system for each legal label.

### 7.4 Do not use a naive average

A municipal Watchdog Score should not simply average every property score.

Simple averaging creates several problems:

- large numbers of typical parcels pull the score toward the middle;
- small but important tails disappear;
- a municipality with a wide Overassessment Position distribution can look identical to one where every property is near the median;
- property-class composition can distort comparisons;
- missing-data patterns can vary geographically;
- and higher-level averages naturally compress toward the center.

AARP explicitly notes this centralizing effect when neighborhood scores are averaged upward into cities, counties, and states.

Watchdog should therefore preserve **distribution information**.

A future municipal model should be researched around measures such as:

- median property score;
- percentage of parcels in materially pressured bands;
- percentage in favorable bands;
- lower-tail and upper-tail conditions;
- ROBUST component distributions;
- assessment uniformity;
- score dispersion;
- burden distribution;
- revaluation pressure;
- tax and levy trajectory;
- ratable-base change;
- appeal context;
- exemption/PILOT context where appropriate;
- and source/evidence coverage.

The exact weighting should come from research and validation, not from branding convenience.

### 7.5 County score

A County Watchdog Score should combine municipal distributions with legitimate county-level context.

Potential evidence includes:

- distribution of municipal scores;
- ROBUST component distributions across municipalities;
- property-score dispersion across the county;
- county appeal history and recourse context;
- county tax/levy context when directly relevant;
- cross-municipal variation;
- evidence coverage and source freshness.

Again, the county score should not imply that county government controls every input. It is a geographic measurement, not an assignment of political blame.

### 7.6 State score

The New Jersey Watchdog Score can become a statewide pulse.

It should answer a question such as:

> **How favorable, stable, and even is the current statewide property-tax and assessment environment under the Watchdog model, and how is that condition changing?**

A single state number should always be accompanied by ROBUST components and geographic distributions. Otherwise a statewide average can hide local stress.

The public experience might show:

```text
NEW JERSEY WATCHDOG SCORE
64
Confidence 97
Momentum -2 YoY

ROBUST
R 66  Recourse
O 69  Overassessment Position
B 54  Burden
U 72  Uniformity
S 58  Stability
T 63  Trajectory

21 counties · 564 municipalities represented
```

The numbers above are illustrative only. They are not current Watchdog calculations.

---

## 8. ROBUST is the shared component language

ROBUST should become the recognizable explanatory grammar across Watchdog Score scopes.

### 8.1 R — Recourse

What credible process or correction context exists when a measured condition deserves review?

At property level this may include appeal context. At broader levels it may include aggregated appeal/correction patterns and the functioning of relevant review mechanisms.

Recourse is not a prediction of success.

### 8.2 O — Overassessment Position

Where does the subject sit relative to supported assessment/value evidence?

At property level, this emphasizes Chapter 123 and supported-value position where testable.

At municipal, county, and state levels, the emphasis shifts toward the distribution, prevalence, and severity of parcel-level assessment positions rather than a single parcel judgment.

### 8.3 B — Burden

What recurring property-tax cost is being carried relative to supported value or another appropriate base?

At broader scopes, distribution matters as much as the average.

### 8.4 U — Uniformity

How consistently does the relevant assessment system treat comparable property/value relationships?

At municipal level, COD and other dispersion measures may be central. At higher levels, Watchdog should summarize distributions without washing out local inconsistency.

### 8.5 S — Stability

How much evidence suggests that the current condition is structurally stable versus exposed to reset, revaluation, fiscal, or assessment pressure?

Watchdog already has governed markers related to revaluation risk, fiscal resilience, municipal cost absorption, levy/base relationships, collection rates, and other municipal finance conditions. Where validated, those markers can feed S rather than creating an unrelated top-level score vocabulary.

### 8.6 T — Trajectory

Which direction are the important relationships moving?

Historical MOD-IV, assessment changes, sales ratios, tax rates, levies, ratable-base movement, and other longitudinal markers can make this increasingly powerful.

### 8.7 Scope-specific inputs, stable public language

ROBUST should stabilize the public language without freezing the evidence model.

A property, municipality, county, and state can all use the same six letters while relying on different validated marker sets and weights.

The rule is:

> **Keep the top-level language stable; let the governed evidence beneath each dimension become more sophisticated.**

If research shows that a ROBUST dimension cannot be validly measured at a particular scope, Watchdog should disclose insufficient evidence or revise the model through a documented version change. It should never invent an input merely to preserve the acronym.

### 8.8 Evidence remains outside the score

Evidence quality is important enough to stand on its own.

A weak-evidence subject should not receive a better or worse substantive score merely because Watchdog knows less about it.

Instead:

```text
Score      = measured condition produced through ROBUST
Confidence = evidence sufficiency and quality
Momentum   = change in the headline Watchdog Score
```

This three-part presentation, with ROBUST underneath, is the strongest candidate for Watchdog's long-term public language.

---

## 9. From snapshot to longitudinal intelligence

A static score is useful.

A score history is more useful.

A score history with reasoned change attribution can change how people understand property ownership.

### 9.1 The important question becomes “why did it move?”

Imagine a homeowner receives:

```text
Your Watchdog Score moved from 71 to 63.

Primary ROBUST drivers:
- S · Stability weakened as revaluation pressure increased
- B · Burden moved above its prior statewide position
- U · Uniformity weakened

No material change:
- O · Overassessment Position
- R · Recourse

Confidence: 94%
```

That is a fundamentally different product from a property-data lookup.

It turns public records into a monitoring system.

### 9.2 Score history must distinguish data change from model change

The score can move for at least four reasons:

1. the world changed;
2. a government source published a new observation;
3. Watchdog corrected or improved source data;
4. Watchdog changed the model.

Those are not equivalent.

The UI should eventually label them explicitly:

- **Evidence change**
- **Model-version change**
- **Source correction**
- **Property event**

A historical chart that mixes those causes without explanation can mislead users.

### 9.3 Material-change thresholds

Not every one-point movement deserves an alert.

Watchdog should study materiality by ROBUST component and use case. A three-point change caused by a source correction may matter more than a five-point move caused by a routine cohort rebalance.

Alerts should therefore consider:

- absolute score change;
- band change;
- ROBUST component change;
- confidence change;
- new evidence source;
- material property event;
- and professional context.

---

## 10. How the score can improve living decisions

The Watchdog Score should influence living situations by improving the **quality and timing of questions**, not by telling people where they should live.

### 10.1 Homeowners

A homeowner can use the score to understand:

- **B:** whether property-tax burden is becoming more or less favorable;
- **O:** whether assessment position deserves investigation;
- **S:** whether revaluation/reset pressure is increasing;
- **T:** whether the underlying relationship is moving materially;
- **R:** whether credible correction/appeal context deserves review;
- **U:** whether municipal assessment consistency is changing;
- and which factors actually caused the score to move.

This can improve household planning.

Instead of discovering a tax change only after escrow adjusts, a homeowner may have earlier context for a reserve decision. Instead of filing an appeal because a neighbor complained, the owner can inspect evidence strength and Chapter 123 context. Instead of assuming a low score condemns the home, the owner can see exactly which ROBUST dimension is responsible.

### 10.2 Buyers

A buyer can compare properties on a dimension that traditional listing portals often reduce to a current annual-tax number.

Current tax alone cannot describe:

- burden relative to value;
- assessment position;
- assessment consistency;
- reset exposure;
- trajectory;
- recourse context;
- or the reliability of the underlying evidence.

Watchdog can make those relationships visible before the buyer is deep into a transaction.

The score should remain one input among many. It should not attempt to replace preferences about location, schools, commute, architecture, family needs, affordability, or lifestyle.

### 10.3 Sellers

A seller can identify property-tax or public-record questions likely to appear during marketing and prepare evidence before they become objections.

A lower score might produce a better sales process if the seller understands the reason and can document it. A score is therefore not merely a marketing badge. It can be a preparation tool.

### 10.4 Long-term ownership

Over years, a homeowner's score history can become a property fiscal record:

- what changed;
- when it changed;
- which source changed;
- which ROBUST dimension moved;
- how the property moved relative to its municipality and state;
- and which actions were taken in response.

That history may eventually be more valuable than the current score alone.

---

## 11. Professional decision support

### 11.1 Real estate professionals

Agents can use the Watchdog Score and ROBUST breakdown as a conversation starter and prioritization layer:

- explain tax position without dumping spreadsheets on a client;
- identify properties needing deeper diligence;
- prepare for buyer objections;
- identify sellers who may benefit from assessment review;
- compare score and ROBUST changes across a farm;
- and monitor municipal conditions that affect client conversations.

The professional advantage comes from the **drivers**, not from reciting the number.

### 11.2 Attorneys and tax professionals

The score can help rank matters for review, especially when paired with O — Overassessment Position, R — Recourse, evidence coverage, Chapter 123 context, appeal evidence strength, and deadline context.

It should never be described as a legal conclusion or guaranteed appeal outcome.

### 11.3 Appraisers

Appraisers may use component evidence to understand assessment-to-sale relationships, municipal uniformity, comparable-evidence reliability, and source completeness.

The Watchdog Score itself is not an appraisal and should never be represented as one.

### 11.4 Mortgage and lending professionals

B — Burden, S — Stability, and T — Trajectory can be useful for property-cost and collateral conversations.

The score should not become a borrower credit score or an automated credit-eligibility factor. Where lenders use Watchdog data, the product should distinguish property intelligence from borrower underwriting.

### 11.5 Investors

Investors can use score distributions and ROBUST changes to prioritize diligence across many properties or municipalities.

Portfolio tools can eventually answer:

- Where is Burden concentrated?
- Which holdings deteriorated materially?
- Which municipality-level ROBUST drivers affect multiple assets?
- Where is evidence weak enough that the apparent score should not be trusted?

### 11.6 Municipal professionals

A municipal score can be useful if it is treated as diagnostic evidence rather than a public-relations grade.

Officials and professionals could use ROBUST components to inspect:

- Recourse patterns;
- Overassessment Position distributions;
- Burden distributions;
- Uniformity;
- Stability and revaluation pressure;
- Trajectory in levies, ratables, assessments, and related evidence.

A pressured component can identify where investigation or communication may help. It should not automatically imply misconduct or incompetence.

---

## 12. Civic and societal use

A widely adopted Watchdog Score could influence more than individual real estate decisions.

That creates opportunity and responsibility.

### 12.1 A common factual starting point

Public debate about property taxes often begins with anecdotes:

- “Taxes are out of control.”
- “Assessments are unfair.”
- “This town always reassesses.”
- “Nobody wins an appeal here.”
- “Development is fixing the tax base.”
- “Development is making things worse.”

A governed score cannot settle those arguments by itself. It can improve them by forcing the discussion into ROBUST dimensions and evidence.

Instead of debating a single slogan, people can inspect:

- Recourse;
- Overassessment Position;
- Burden;
- Uniformity;
- Stability;
- Trajectory;
- distribution;
- confidence;
- and the underlying source observations.

### 12.2 Prioritization

The score can help decision makers decide what deserves further study.

A statewide map might reveal clusters of:

- unusually high Burden pressure;
- deteriorating Uniformity;
- worsening Overassessment Position distributions;
- rapid negative Momentum;
- low evidence coverage;
- elevated Stability pressure;
- or unusual Trajectory changes.

Those clusters can guide investigation, outreach, research, and public communication.

### 12.3 Resource decisions require caution

Composite indicators become dangerous when a score is treated as a mechanical allocation formula.

The National Academies has cautioned that performance measures rarely represent every factor producing an outcome and that formulaic resource allocation can create unintended behavior, including efforts to optimize the metric rather than the underlying condition.

Watchdog should therefore support policy prioritization without claiming:

```text
Municipality A scored 42, therefore it automatically deserves $X.
```

A score can identify the question. A resource decision should use the full evidence and the authority of the relevant decision maker.

### 12.4 The Watchdog Score as public infrastructure

Over time, the strongest version of the product may resemble a statewide observatory:

- every property has a current and historical score when evidence is sufficient;
- every municipality has a distribution-aware score;
- every county has a score and ROBUST profile;
- the state has a continuously updated score;
- every score links to drivers and sources;
- and changes are visible over time.

This could create a shared measurement layer across residents, professionals, journalists, researchers, civic groups, and government.

---

## 13. Political use without political scoring

Property taxes are political because budgets, assessments, development, exemptions, public services, and tax policy are political subjects.

The Watchdog Score will therefore enter political conversations if it becomes successful.

Watchdog should plan for that now.

### 13.1 Measure consequences, not ideology

ROBUST may measure observable consequences associated with public policy, such as:

- appeal/correction context;
- assessment position distributions;
- tax burden;
- assessment uniformity;
- revaluation and fiscal stability pressure;
- assessment, levy, rate, and ratable trajectory.

The underlying markers may also include tax-rate change, levy growth, ratable-base growth, exemption or PILOT exposure, permit activity, and fiscal resilience where they validly support a ROBUST dimension.

The score should not contain a hidden value such as:

- Democratic policy = positive;
- Republican policy = negative;
- more spending = automatically negative;
- less spending = automatically positive;
- development = automatically positive;
- preservation = automatically negative.

Those are political judgments, not neutral measurements.

### 13.2 A score cannot establish causation by itself

If a municipal score falls during a mayor's term, that does not establish that the mayor caused the decline.

The score may reflect:

- state policy;
- county policy;
- school levies;
- market changes;
- reassessment cycles;
- court decisions;
- prior budgets;
- development timing;
- data revisions;
- or many interacting factors.

Watchdog should provide timelines and ROBUST component evidence while being careful about causal language.

### 13.3 Public figures may cite the score

Candidates, officials, advocacy groups, and journalists may eventually say:

- “Our town's Watchdog Score rose six points.”
- “The county is below the state median.”
- “Uniformity declined.”
- “Burden improved while Stability worsened.”

Watchdog cannot control every interpretation. It can make misuse harder by publishing methodology, version history, confidence, ROBUST drivers, and warnings against unsupported causal claims.

### 13.4 No election-cycle methodology

Watchdog should not change scoring methods or ROBUST definitions to make a named jurisdiction look better or worse during a campaign, budget fight, referendum, or policy debate.

Methodology releases should follow a documented review cadence and validation process.

If an urgent defect requires an out-of-cycle correction, Watchdog should publish the defect, impact, correction, and affected versions.

---

## 14. The anti-gaming problem

Successful metrics change behavior.

That is partly the point. It is also a threat.

Campbell's law is commonly summarized as the observation that when a quantitative social indicator becomes highly important for decision-making, pressure increases to game or corrupt the indicator and the process it measures.

A future Watchdog Score may create incentives for:

- jurisdictions to dispute unfavorable source facts;
- organizations to optimize visible ROBUST components while neglecting unmeasured problems;
- users to selectively present a favorable score version;
- data providers to alter reporting behavior;
- marketing actors to oversimplify the score;
- or interested parties to lobby Watchdog for favorable methodological changes.

### 14.1 Anti-gaming controls

Watchdog should plan for:

1. **Public methodology**  
   Users should know what ROBUST measures.

2. **Private operational controls where necessary**  
   Public methodology does not require exposing secrets, credentials, anti-abuse thresholds, or security controls.

3. **Source independence**  
   Whenever possible, score components should rely on authoritative or independently verifiable sources.

4. **Multiple components**  
   ROBUST reduces the ability to optimize one simplistic target at the expense of everything else.

5. **Change monitoring**  
   Unexpected distribution shifts should trigger model and source review.

6. **Version integrity**  
   Users should not be able to present an obsolete score as though it were current.

7. **Sensitivity testing**  
   The score should remain reasonably robust to plausible methodological alternatives.

8. **Independent review**  
   As the score becomes consequential, outside statistical, appraisal, tax, housing, public-policy, and ethics review becomes increasingly valuable.

---

## 15. Fair housing and social safeguards

If Watchdog succeeds, its score could appear inside real estate searches, agent CRMs, marketing systems, lending workflows, and consumer decision tools.

That reach means the company should adopt safeguards before the score becomes ubiquitous.

### 15.1 Property conditions, not people

The core score and ROBUST dimensions should be intentionally property-centric and system-centric.

They should not score the people who live at an address.

They should not use protected characteristics to declare one place more desirable than another.

Demographic data may sometimes be useful for public research, statutory analysis, fair-housing auditing, or understanding whether public systems have unequal effects. Those uses should be governed separately and should not quietly become ingredients in the consumer-facing core score.

### 15.2 Avoid digital steering

The Fair Housing Act applies to housing-related transactions and prohibits discrimination based on protected characteristics.

A score integrated into search or marketing can create steering risk if a system uses it to automatically hide, suppress, prioritize, or target housing in ways that discriminate.

Watchdog should therefore distinguish:

- **property intelligence:** “this property has tax-reset exposure”;
- from **people targeting:** “do not show this type of property to this protected group.”

The first can be a legitimate property fact. The second can create serious legal and ethical problems.

### 15.3 No universal definition of a good life

People value different things.

One household may gladly accept higher property taxes for reasons that are outside Watchdog's tax-position model. Another may prioritize low carrying costs. Another may care most about accessibility, proximity to family, architecture, land, commute, or countless other preferences.

ROBUST makes one defined dimension of property reality clearer. It does not claim to define a good life.

---

## 16. Research architecture and validation

A flagship score should be treated like a measurement product, not a marketing slogan with code behind it.

The name **ROBUST Framework** raises the standard further. The system should be able to demonstrate robustness through validation rather than merely assert it.

### 16.1 Validation questions

For each canonical model version, Watchdog should study:

- Does the score measure the construct it claims to measure?
- Do the six ROBUST dimensions retain coherent meaning?
- Are component directions defensible?
- Are weights justified and stable?
- Do small methodological changes cause large rank changes?
- Are some property classes systematically distorted?
- Does missingness cluster geographically?
- Do particular counties or municipalities receive extreme values because of source availability rather than real conditions?
- Are score bands materially distinguishable?
- Does the score predict or correlate with any outcomes it claims to help prioritize?
- Do professional users interpret ROBUST as intended?
- Does the score create harmful incentives or gaming?

### 16.2 Sensitivity report

Every major score version should produce an internal and eventually publishable sensitivity report covering at least:

- alternate weighting sets;
- alternate normalization anchors;
- leave-one-ROBUST-component-out results;
- missing-evidence scenarios;
- cohort changes;
- outlier treatment;
- score-band migration;
- and geography/property-class distribution effects.

### 16.3 Calibration is not only for AI

Watchdog already has a calibration architecture for Intelligence models with precision, recall, false-positive rate, evidence coverage, and promotion gates.

The Watchdog Score is a composite indicator rather than a simple binary classifier, so not every calibration metric transfers directly. The governance concept does.

A score model should move through states such as:

```text
research → preview → calibrated → canonical → deprecated
```

No score should become canonical only because it looks persuasive in a UI.

### 16.4 External advisory review

Within the next several years, Watchdog should consider a Score Methodology Council or equivalent independent advisory process with expertise in areas such as:

- statistics and composite indicators;
- New Jersey property taxation;
- assessment administration;
- appraisal;
- housing law and fair housing;
- municipal finance;
- real estate practice;
- data governance;
- and consumer communication.

The council should advise on methodology. It should not be allowed to manipulate scores for interested parties.

---

## 17. Score presentation language

The words around a score shape how people use it.

Current UI labels such as “good,” “mid,” and “bad” are efficient internally but are too broad for the long-term public meaning of the brand.

Watchdog should move toward neutral, construct-specific language.

A future property tax-position scale might use language similar to:

| Score | Suggested public band | Intended meaning |
| ---: | --- | --- |
| 80–100 | Strong position | Measured tax-position conditions are unusually favorable under the current model. |
| 65–79 | Favorable position | Measured conditions are more favorable than the model's reference position. |
| 50–64 | Typical / mixed position | Conditions are broadly typical or contain offsetting strengths and pressures. |
| 35–49 | Pressured position | One or more measured conditions deserve closer review. |
| 0–34 | Highly pressured position | Multiple or substantial measured pressures are present. |

These labels are a proposal for research and product review, not a production change authorized by this paper.

### 17.1 Avoid letter grades as the primary language

A, B, C, D, and E grades imply school-style judgment and can easily become “good town / bad town” shorthand.

The letters **R-O-B-U-S-T are not grades.** They are dimension labels.

The 0–100 score can remain. Public language should emphasize position, ROBUST drivers, Confidence, and Momentum.

### 17.2 Show ROBUST without overwhelming the user

A compact public pattern can be:

```text
WATCHDOG SCORE 72
Favorable position
Confidence 91 · Momentum +4

ROBUST
R 68 · O 82 · B 61 · U 76 · S 70 · T 75
```

A tap or click expands the full names and evidence.

### 17.3 Show uncertainty visually

A score with 62% evidence coverage should look different from one with 98% coverage.

Possible UI treatments include:

- confidence label;
- evidence ring;
- faded or dotted score badge;
- explicit “limited evidence” status;
- or withholding the number below the minimum evidence threshold.

### 17.4 Top reason codes

A complex score becomes more actionable when the user receives the most important reasons affecting it.

A Watchdog result should therefore expose concise ROBUST reason codes such as:

- **B:** Tax burden above reference range
- **O:** Chapter 123 position favorable
- **U:** Municipal uniformity weakening
- **S:** Revaluation pressure elevated
- **T:** Assessment relationship moving away from verified market evidence
- **R:** Appeal context limited or incomplete

The user can then open each reason for evidence.

---

## 18. Versioning and the meaning of history

### 18.1 Model identity

A canonical score observation should eventually carry an identity similar to:

```json
{
  "score_family": "watchdog",
  "framework": "ROBUST",
  "scope": "property",
  "score": 72,
  "confidence": 91,
  "momentum": 4,
  "model_version": "property-tax-position-v2.1",
  "framework_version": "robust-v1",
  "cohort_version": "nj-residential-2027q1",
  "formula_version": "score-components-v18",
  "evidence_coverage": 0.91,
  "observed_at": "2027-03-31T12:00:00Z",
  "components": {
    "R": 68,
    "O": 82,
    "B": 61,
    "U": 76,
    "S": 70,
    "T": 75
  }
}
```

The object above is illustrative, not a current API contract.

### 18.2 Restatement policy

When a model materially changes, Watchdog should choose one of three explicit treatments:

1. **Prospective only**  
   New model applies from an effective date forward.

2. **Restated history**  
   Historical evidence is recomputed under the new model and presented as a separate restated series.

3. **Dual view during transition**  
   Old and new series are both available for a documented transition period.

What Watchdog should not do is silently rewrite history.

### 18.3 Version changes can be a trust feature

A model changing is not evidence of failure.

A model that never changes despite better data and validation may be less trustworthy.

The trust signal is whether Watchdog explains what changed and why.

ROBUST itself should therefore have an explicit framework version when the definitions of R, O, B, U, S, or T materially change.

---

## 19. The 5-year product horizon

The following roadmap is directional research strategy, not a committed release schedule.

### Phase 1: Canonicalize the property score and ROBUST contract

**Near term**

- establish one canonical server-side property Watchdog Score contract;
- formally register **ROBUST v1** as the six-dimension public framework;
- map legacy internal component names to R/O/B/U/S/T without changing meaning silently;
- eliminate or clearly deprecate legacy score aliases and experimental caches;
- put the flagship score through the same formula/version governance expected of other derived markers;
- define minimum evidence requirements;
- expose Confidence, Momentum, ROBUST values, and top drivers consistently;
- persist governed score observations;
- make score-history changes explainable;
- create automated score-contract tests;
- publish the consumer methodology.

This phase is the prerequisite for aggressive marketing.

The brand promise should be stronger than “we calculate a score.” It should be:

> **There is one canonical Watchdog Score for this scope and version, ROBUST explains it, and we can show exactly why it is what it is.**

### Phase 2: Build the Municipal Watchdog Score

**1–2 years**

- research distribution-aware municipal aggregation;
- preserve the ROBUST top-level language while validating scope-specific marker sets and weights;
- calculate coverage across all New Jersey municipalities;
- build municipal score histories;
- show ROBUST drivers and dispersion;
- launch comparison maps and municipal profiles;
- develop public methodology and correction workflows;
- avoid naive rank tables when score differences are not meaningful.

### Phase 3: County and State score system

**2–4 years**

- establish county-level ROBUST models and aggregation;
- launch the New Jersey Watchdog Score;
- build a statewide Watchdog Atlas;
- expose ROBUST distributions, not only headline numbers;
- integrate score history with Watchdog Change Intelligence;
- support annual and intra-year state-of-property-tax reports.

### Phase 4: Distribution standard

**3–5 years**

- Watchdog Score API with ROBUST component payloads;
- embeddable score badge;
- IDX/MLS integrations where partnerships permit;
- CRM fields and triggers;
- Watchdog Intelligence explanations;
- Zapier/native automation triggers;
- professional report inclusion;
- press/research datasets;
- consumer browser and mobile surfaces.

The product goal is for the score to travel with the property rather than requiring every user to visit Watchdog first.

---

## 20. The 10-year landscape

The 10-year opportunity is to make the Watchdog Score and ROBUST Framework a durable piece of how property conditions are understood.

### 20.1 A standard property datum

The strongest marketing outcome would be that New Jersey consumers begin to expect a Watchdog Score anywhere they encounter a property.

A listing without it feels less complete.

A buyer asks an agent, “What's the Watchdog Score?”

A homeowner notices when it changes.

A professional knows the number is only the headline and opens ROBUST when the decision matters.

### 20.2 The Watchdog Atlas

A public statewide map could allow users to move seamlessly:

```text
New Jersey
  → County
    → Municipality
      → Neighborhood / local cluster where appropriate
        → Property
```

At every level the user sees:

- Score;
- Confidence;
- Momentum;
- ROBUST profile;
- historical change;
- distribution;
- and evidence sources.

The map would not label places as good or bad. It would show where measured property-tax and public-record conditions differ and why.

### 20.3 Policy simulator

Once Watchdog has enough longitudinal evidence, policymakers, researchers, professionals, and citizens could explore scenarios such as:

- What if levy growth continues at its current rate?
- What if the municipality completes a revaluation?
- What happens to the ROBUST profile if ratable growth improves?
- Which components are most sensitive to an assessment reset?
- How did a policy change correspond with later property-tax conditions?

Simulation outputs must be labeled as scenarios, not predictions or official forecasts.

### 20.4 Property Passport

The Score can become the front door to a larger Watchdog Property Passport.

A property could carry:

- current score;
- ROBUST profile;
- historical scores;
- historical ROBUST components;
- source history;
- key public-record events;
- evidence chain;
- model versions;
- important marker changes;
- professional reports;
- and user-authorized workflow outcomes.

The score answers “where does it stand?”

ROBUST answers “what is driving it?”

The Passport answers “how did it get here?”

### 20.5 Research dataset

A decade of versioned property and municipal score observations can become valuable research infrastructure.

Possible research questions include:

- how Uniformity changes around revaluations;
- how Burden shifts across market cycles;
- whether Momentum or Trajectory precedes appeal activity;
- how municipal fiscal pressure affects Stability;
- which ROBUST markers are actually useful to professionals;
- how public-record completeness changes over time;
- and where model uncertainty remains highest.

Research should be designed to improve understanding, not reverse-engineer a politically desired conclusion.

### 20.6 Geographic expansion

New Jersey is unusually valuable as a first environment because Watchdog can build deep understanding of the state's assessment, equalization, Chapter 123, municipal, county, and public-record systems.

If Watchdog later expands beyond New Jersey, the 0–100 grammar, Score Constitution, and ROBUST top-level language can travel only where the constructs remain valid. Jurisdiction-specific evidence models must change.

A Pennsylvania or Florida property should not receive a New Jersey formula with different labels.

The brand can be national. The evidence model must remain local to the governing system.

---

## 21. How the Watchdog Score can change decision-making

If the score becomes trusted, the largest impact may be cultural rather than numerical.

### Today

People often act after a bill changes, after a buyer objects, after an appeal deadline approaches, or after a municipality announces a major change.

### Future

Watchdog can move those decisions earlier.

**Reactive:** “Why did my taxes jump?”  
**Proactive:** “My S — Stability and T — Trajectory have changed for three consecutive periods. What should I review?”

**Reactive:** “Is this town expensive?”  
**Proactive:** “B — Burden is high, but U — Uniformity and S — Stability are strong. Which part matters to my decision?”

**Reactive:** “This politician says taxes improved.”  
**Proactive:** “The municipal Watchdog Score improved four points. ROBUST shows that Trajectory improved while household Burden barely moved.”

**Reactive:** “This property has a low score, so avoid it.”  
**Proactive:** “The score is pressured because of one municipal Stability factor. The property's O — Overassessment Position is actually favorable.”

This is the long-term purpose of the score:

> **Turn a number into better questions, and better questions into earlier, more evidence-based decisions.**

---

## 22. Product and engineering requirements implied by this paper

This whitepaper is not a production migration. It does establish requirements that future score work should satisfy.

### 22.1 Canonical score service

The flagship score should ultimately be calculated server-side through a governed service rather than scattered browser formulas.

The service should:

- enforce the current model version;
- enforce the current ROBUST framework version;
- load governed dependencies;
- return explicit missing evidence;
- compute evidence coverage;
- record model/formula/cohort/framework versions;
- emit ROBUST component values and top drivers;
- create immutable observations when appropriate;
- and support property-scale batch computation.

### 22.2 Score registry

The platform should distinguish:

- score family;
- score scope;
- canonical model version;
- ROBUST framework version;
- research/preview versions;
- status;
- effective date;
- deprecated date;
- minimum evidence coverage;
- dependencies;
- normalization policy;
- weighting policy;
- and public explanation.

### 22.3 Contract tests

Automated tests should fail if:

- a noncanonical model is exposed as `Watchdog Score`;
- a noncanonical component set is marketed as ROBUST;
- score is outside 0–100;
- evidence coverage is missing;
- a required dependency is silently replaced;
- a model/framework version is absent;
- a deprecated score is presented as current;
- the same input/version set produces different output;
- source lineage cannot be resolved;
- or a geographic score is generated below its minimum data threshold.

### 22.4 Monitoring

Score distribution should be monitored by:

- model version;
- ROBUST framework version;
- ROBUST component;
- county;
- municipality;
- property class;
- evidence-coverage band;
- and time.

Unexpected jumps should trigger review before a scoring defect becomes a statewide marketing problem.

---

## 23. The immediate research agenda

Before a future Watchdog Score v2 or geographic score family is promoted, Watchdog should complete the following research program.

### A. Canonical property score and ROBUST audit

- Recalculate the six-component score over a broad representative statewide sample.
- Document coverage by R/O/B/U/S/T.
- Inspect property-class differences.
- Inspect score and component distributions by county and municipality.
- Test current normalization anchors.
- Test the influence of R — Recourse.
- Test whether missingness renormalization creates material bias.
- Establish a minimum evidence threshold.
- Confirm that O — Overassessment Position is interpreted neutrally and accurately by users.

### B. Weight sensitivity

Test plausible alternative weight sets and quantify:

- median score movement;
- 90th/10th percentile movement;
- rank correlation;
- band migration;
- ROBUST component dominance;
- county effects;
- municipal effects;
- property-class effects.

### C. Band research

Determine whether proposed score bands are statistically and behaviorally meaningful.

The public should not see five labels merely because five colors look good in a product design.

### D. Outcome research

Where appropriate and lawful, study whether ROBUST components help prioritize real outcomes, such as:

- successful identification of assessment-review candidates;
- material tax changes;
- revaluation/reset events;
- professional diligence findings;
- user follow-through;
- or corrected public-record discrepancies.

Correlation should not be mislabeled causation.

### E. Municipal ROBUST model research

Develop candidate municipal models using distribution-aware aggregation, then test:

- Recourse;
- Overassessment Position distribution;
- Burden distribution;
- Uniformity;
- Stability;
- Trajectory;
- source coverage;
- cross-year reliability;
- and whether six stable public dimensions can validly explain the municipal construct.

### F. Independent review

Before the score becomes a widely distributed external standard, commission an independent methodology review.

A flagship measurement product called ROBUST should be strong enough to survive serious scrutiny.

---

## 24. Proposed public promise

Watchdog should eventually be able to make this promise wherever the Score appears:

> **The Watchdog Score is built from governed property and public-record evidence and explained through the ROBUST Framework: Recourse, Overassessment Position, Burden, Uniformity, Stability, and Trajectory. It measures a defined property or place condition on a 0–100 scale. It is not a grade on the people, community, or government connected to that place. Every score has a version, evidence coverage, and explainable drivers. When evidence is insufficient, Watchdog says so rather than inventing certainty.**

That statement is more valuable than claiming the score is perfect.

It tells users what kind of product Watchdog intends to be.

---

## 25. Principles for marketing and branding the score

Because the Watchdog Score is expected to become a primary marketing asset, the marketing and brand rules should be as deliberate as the mathematical rules.

### 25.1 Official naming hierarchy

The canonical hierarchy is:

1. **Watchdog** — the brand and platform.
2. **Watchdog Score** — the 0–100 product/result.
3. **ROBUST Framework** — the branded methodology that explains the Score.
4. **R / O / B / U / S / T dimensions** — the six top-level explanatory components.
5. **Markers and evidence** — the governed calculations and source facts beneath each dimension.

Preferred public construction:

> **Watchdog Score 72, powered by the ROBUST Framework.**

Do not collapse the hierarchy by casually replacing “Watchdog Score” with “ROBUST Score.”

### 25.2 Official ROBUST expansion

The official expansion is fixed unless a future governed methodology version explicitly changes it:

- **R — Recourse**
- **O — Overassessment Position**
- **B — Burden**
- **U — Uniformity**
- **S — Stability**
- **T — Trajectory**

Use **Overassessment Position**, not simply “Overassessment,” in formal methodology and consumer explanation. The additional word prevents the framework from implying a conclusion before evidence is evaluated.

### 25.3 Market clarity, not fear

Good:

- “See what is driving your Watchdog Score.”
- “Explore your ROBUST breakdown.”
- “Understand your property's tax position.”
- “Know when your score changes and why.”
- “Compare the evidence behind two properties.”
- “One score. Six dimensions. ROBUST.”

Avoid:

- “Your house is bad.”
- “Avoid every town under 50.”
- “This score proves your assessment is illegal.”
- “A Watchdog Score of 80 guarantees lower taxes.”
- “This is a ROBUST home.”

### 25.4 Make the score and framework memorable

The number should be visually consistent across Watchdog products.

The ROBUST letters should also use a consistent order, naming, and visual treatment across:

- search;
- property reports;
- dashboards;
- saved homes;
- town pages;
- county pages;
- state pages;
- agent tools;
- professional reports;
- marketing materials;
- APIs;
- whitepapers;
- and future partner listings.

A user who learns R/O/B/U/S/T once should recognize it everywhere.

### 25.5 Make the explanation more valuable than the badge

The badge earns the click.

ROBUST earns understanding.

The deeper evidence, history, Intelligence, alerts, comparisons, and workflows can earn the subscription.

That is an important business distinction.

A free surface may show a score and enough ROBUST explanation for responsible interpretation. Paid tiers can provide deeper history, marker evidence, professional interpretation, scenarios, portfolio comparisons, alerts, and workflow actions.

The score should create curiosity without withholding the basic meaning required for responsible interpretation.

### 25.6 Brand governance

ROBUST should be treated as Watchdog intellectual-property language even before any trademark strategy is determined.

Operationally:

- capitalize **ROBUST** when referring to the framework;
- use **ROBUST Framework** on first formal mention;
- preserve the letter order R-O-B-U-S-T;
- do not invent alternate expansions in product copy;
- do not use ROBUST as a generic adjective for unrelated Watchdog features;
- version material methodology changes;
- and update design, documentation, API, marketing, and partner guidance together when the framework changes.

---

## 26. Research precedents and what Watchdog should learn from them

### OECD / European Commission composite-indicator guidance

**Lesson:** Composite indicators are useful communication tools, but methodological choices can materially change results. Publish methodology and run uncertainty/sensitivity analysis. The ROBUST name should be backed by actual robustness testing.

Source: OECD/European Union/EC-JRC, *Handbook on Constructing Composite Indicators: Methodology and User Guide* (2008).  
https://www.oecd.org/en/publications/handbook-on-constructing-composite-indicators-methodology-and-user-guide_9789264043466-en.html

### AARP Livability Index

**Lesson:** A shared 0–100 language can span neighborhood, city, county, and state while making clear that a low score does not declare a place unlivable. Higher-level geographic aggregation compresses scores and requires careful explanation. Users benefit from category breakdowns.

Sources:  
https://livabilityindex.aarp.org/what-is-livability  
https://livabilityindex.aarp.org/methods-sources

### Walk Score

**Lesson:** A transparent, easy-to-recognize score can become a standard property datum and distribute through listings, APIs, search, research, planning, real estate, and finance.

Sources:  
https://www.walkscore.com/methodology.html  
https://www.walkscore.com/professional/api.php  
https://www.walkscore.com/about.shtml

### NIST AI Risk Management Framework

**Lesson:** As Intelligence increasingly explains and acts on scores, valid/reliable behavior, transparency, explainability, accountability, privacy, security, and bias management should be designed into the system rather than added after deployment.

Source:  
https://www.nist.gov/itl/ai-risk-management-framework

### National Academies work on indicators and performance measures

**Lesson:** Indicators summarize conditions but do not independently establish causation or prescribe the policy response. Formulaic resource allocation and rigid targets can create unintended consequences. Context and explanation are as important as the score.

Sources:  
https://nap.nationalacademies.org/read/988/chapter/4  
https://nap.nationalacademies.org/read/6487/chapter/4  
https://nap.nationalacademies.org/read/11292/chapter/2

### New Jersey Division of Taxation

**Lesson:** Watchdog's tax-position score can be grounded in a rich statewide public framework including MOD-IV assessment records, SR1A sales, tax rates, equalization, coefficients of deviation, Chapter 123 common-level ranges, and appeal data. These sources have specific statutory and statistical meanings that Watchdog must preserve.

Sources:  
https://www.nj.gov/treasury/taxation/lpt/statdata.shtml  
https://www.nj.gov/treasury/taxation/lpt/lpt-appeal.shtml  
https://www.nj.gov/treasury/taxation/pdf/lpt/chap123/ch123definitions.pdf

### Fair Housing Act / HUD

**Lesson:** A property score that becomes embedded in housing search, brokerage, marketing, and lending must be designed to avoid becoming a mechanism for discrimination or protected-class steering.

Source:  
https://www.hud.gov/helping-americans/fair-housing-act-overview

---

## 27. Conclusion

The Watchdog Score can become much larger than a feature.

It can become the organizing principle for the entire Watchdog platform.

The Score gives the public one understandable number. **ROBUST explains the number.** Markers explain each ROBUST dimension. Source evidence supports the markers. History explains change. Watchdog Intelligence helps interpret the evidence. Automation helps users act on it.

The architecture becomes:

```text
SOURCE
  ↓
EVIDENCE
  ↓
MARKERS
  ↓
ROBUST
R · O · B · U · S · T
  ↓
WATCHDOG SCORE
  ↓
CONFIDENCE + MOMENTUM
  ↓
INTELLIGENCE
  ↓
DECISION
  ↓
ACTION
  ↓
OUTCOME
  ↓
LEARNING
```

If Watchdog maintains strict boundaries, the score can influence living decisions without pretending to define a good life. It can influence civic priorities without becoming partisan. It can help governments see pressure without assigning simplistic blame. It can help professionals find the next important question without replacing their judgment. It can become a marketing standard without becoming an empty badge.

Five years from now, success would mean that New Jersey users recognize the Watchdog Score, recognize ROBUST, and understand that a number always has a reason.

Ten years from now, success would mean that property owners, professionals, researchers, civic institutions, and technology partners treat a versioned Watchdog Score, its ROBUST profile, and its evidence trail as a normal part of understanding a property or place.

The most important condition is that trust scales with distribution.

The more influential the score becomes, the more transparent, reproducible, cautious, and resistant to manipulation Watchdog must become.

That is not a constraint on the Watchdog Score's ambition.

It is what makes the ambition possible.

---

## Appendix A: Current property score contract

**Current implemented model:** property tax-position composite  
**Public methodology brand:** ROBUST Framework  
**Range:** 0–100  
**Current components and unchanged weights:**

```text
R · Recourse                    10
O · Overassessment Position     20
B · Burden                      30
U · Uniformity                  15
S · Stability                   15
T · Trajectory                  10
                                ──
                               100
```

**Legacy terminology mapping:**

```text
Assessment fairness   → O · Overassessment Position
Tax burden            → B · Burden
Town uniformity       → U · Uniformity
Revaluation stability → S · Stability
Assessment trajectory → T · Trajectory
Appeal recourse       → R · Recourse
```

The mapping above changes branding and explanatory language only. It does not by itself change current production weights or source dependencies.

**Missing inputs:** component omitted; available weights renormalized.  
**Current evidence confidence:** coverage based on available component weight.  
**Interpretation:** property-tax position only, not overall home or community quality.

### Proposed future presentation

```text
WATCHDOG SCORE
72
Favorable position

Confidence 91
Momentum +4 / 12 months

ROBUST
R 68  Recourse
O 82  Overassessment Position
B 61  Burden
U 76  Uniformity
S 70  Stability
T 75  Trajectory

Top drivers
+ O · Overassessment Position
+ U · Uniformity
- S · Stability

Model property-tax-position-vX
Framework ROBUST v1
Evidence updated YYYY-MM-DD
```

---

## Appendix B: Proposed score object principles

A future canonical score payload should include, at minimum:

```text
identity
- subject id
- scope
- geography

measurement
- score
- score band
- confidence
- evidence coverage
- momentum

framework
- ROBUST framework version
- R value
- O value
- B value
- U value
- S value
- T value

model
- model key
- model version
- formula/component versions
- cohort key/version

explanation
- component values
- component weights
- top drivers
- missing dependencies
- reason codes

lineage
- source references
- evidence timestamps
- computation timestamp
- facts/evidence hash where appropriate

status
- canonical / preview / deprecated
- correction/restatement metadata
```

---

## Appendix C: ROBUST brand contract

### Product name

**Watchdog Score**

### Methodology name

**ROBUST Framework**

### Official expansion

**R** — Recourse  
**O** — Overassessment Position  
**B** — Burden  
**U** — Uniformity  
**S** — Stability  
**T** — Trajectory

### Preferred descriptors

- “The Watchdog Score is powered by the ROBUST Framework.”
- “One score. Six dimensions. ROBUST.”
- “ROBUST explains why the Watchdog Score is what it is.”

### Naming guardrails

- Keep **Watchdog Score** as the headline product name.
- Keep **ROBUST** uppercase when naming the framework.
- Use **Overassessment Position** in formal expansion.
- Do not describe a home, town, resident, or government as “ROBUST” because of its score.
- Do not use alternate ROBUST expansions in product copy without a governed framework-version change.
- Do not attach ROBUST branding to an experimental or noncanonical score.

---

## Appendix D: Questions this paper deliberately leaves open

The whitepaper establishes the philosophy, ROBUST branding, and research direction. It does **not** settle these questions without validation:

1. Should the current ROBUST weights remain unchanged after statewide sensitivity testing?
2. What is the minimum evidence coverage required before Watchdog withholds a property score?
3. Should R — Recourse remain a core property-score component or become contextual only?
4. Which normalization anchors should replace or update fixed Burden anchors over time?
5. What exact scope-specific marker sets and weights should define the Municipal Watchdog Score while preserving ROBUST as the public language?
6. How should residential, commercial, vacant, farm, and exempt classes be handled in geographic aggregates?
7. Should geographic scores be parcel-weighted, value-weighted, household-weighted, distribution-based, or a governed combination?
8. How should Watchdog communicate statistical uncertainty beyond evidence coverage?
9. What movement is material enough to trigger a Watchdog Score alert?
10. What independent validation should be required before the score is licensed broadly to MLS, government, financial, or research partners?
11. At what point should ROBUST Framework naming, visual identity, licensing language, and any trademark strategy be formalized outside product documentation?

These are not weaknesses in the concept. They are the research program required to turn a compelling score and memorable framework into a durable measurement standard.
