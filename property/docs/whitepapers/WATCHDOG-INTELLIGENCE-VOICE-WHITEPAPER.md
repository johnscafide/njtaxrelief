# Watchdog Intelligence Voice
## Governed speech, contextual conversation, narrated intelligence, and safe spoken actions
### A living whitepaper, architecture guide, commercialization model, and research agenda

**Version:** 0.1  
**Date:** August 21, 2026  
**Status:** Living product and engineering document  
**Primary roadmap:** Linear NJW-263 and NJW-265  
**Related systems:** Watchdog Analyst, Data Workbench, Data Center, Watchlists, Compare, Marketing Studio, Watchdog Automation Fabric  
**Scope:** Voice input, spoken output, contextual conversation, entitlement, privacy, browser-native speech, provider abstraction, safe commands, mobile UX, accessibility, telemetry, commercialization, and future voice-triggered automation

> **Core thesis:** Voice should not become a second assistant inside Watchdog. It should become another controlled way to access the same governed Watchdog Intelligence system, using the same evidence, authorization, plan, tool, audit, and human-approval rules as typed interaction.

---

## 1. Executive summary

Watchdog Intelligence already has a natural-language layer capable of turning a user's question into a governed request, using approved tools and structured evidence rather than unrestricted database access. Voice extends that interaction model.

The opportunity is larger than adding a microphone button.

A mature Voice layer can reduce friction at the exact moments when property professionals are most likely to be moving, comparing information, reviewing a property with a client, scanning a Watchlist, or working from a mobile device. It can also turn complex Intelligence into short narrated briefings that are easier to consume than dense screens of property data.

The product direction should therefore be:

**speak intent → show transcript → run the same governed Watchdog Intelligence workflow → show the written evidence-backed result → optionally narrate that result → require the same confirmation for consequential actions**

Voice should improve speed and accessibility without creating a weaker trust model.

The operating principles are:

1. **One Intelligence system, multiple interaction modes.** Typed and spoken requests use the same Analyst, tools, evidence, plan gates, and policy boundaries.
2. **Text remains authoritative.** Speech is an input and presentation layer. Written evidence and sources remain visible and reconstructable.
3. **No silent authority expansion.** A spoken command does not gain more privilege than the same typed request.
4. **Low-risk actions can feel fast.** Read-only navigation and harmless UI actions can execute quickly where appropriate.
5. **Consequential actions retain gates.** External communication, paid activity, legal or financial workflows, destructive changes, and other high-impact actions require existing approval and policy controls.
6. **Raw audio is not a default data asset.** Watchdog should avoid retaining microphone recordings unless a future use case has an explicit product purpose, consent model, retention period, and reviewed security design.
7. **Provider failure must degrade gracefully.** If a speech provider, browser API, or paid gateway is unavailable, typed Watchdog Intelligence remains fully functional.
8. **Voice is part of the paid Intelligence value proposition.** The customer buys Watchdog Intelligence, not minutes of audio.

---

## 2. Production baseline as of August 21, 2026

This paper begins from the current implementation rather than a hypothetical future system.

### 2.1 Completed v1 foundation

Linear NJW-263 established the initial Voice Intelligence product contract:

- Standard / Free: unavailable;
- Agent: available through a Watchdog Intelligence add-on;
- Pro: available through a Watchdog Intelligence add-on;
- Pro+: included;
- Teams: included by default;
- developer access remains available for controlled testing.

The same work established these trust boundaries:

- Voice questions feed the existing governed Analyst path;
- spoken briefs derive from the written Analyst response;
- raw microphone audio is not retained by default;
- Voice has an independent rollout switch;
- usage is recorded through the existing Intelligence usage plane;
- plan and add-on access are enforced separately from UI decoration.

### 2.2 Current zero-spend browser path

The production recovery path shipped after Vercel AI Gateway rejected Fish Audio on the current free Gateway account tier.

Watchdog therefore uses browser-native speech capabilities as the primary v1 path where supported:

- browser speech recognition for spoken questions;
- browser speech synthesis for narrated Watchdog responses;
- transcript review before the user submits to Ask Watchdog;
- Watchdog usage telemetry for the Voice interaction;
- no microphone recording upload to Watchdog on the browser-primary path.

This is strategically useful beyond the immediate account-tier issue. It establishes that Watchdog can separate the **Voice product contract** from any single speech vendor.

### 2.3 Server provider path remains a fallback

The server implementation retains a speech-provider abstraction so Watchdog can later use a funded Vercel AI Gateway or another provider when the business case supports it.

That provider path should be evaluated on:

- recognition accuracy;
- latency;
- browser and mobile coverage;
- language coverage;
- voice quality;
- privacy terms;
- cost predictability;
- outage behavior;
- observability;
- data-retention options.

A provider should not become the architecture.

---

## 3. Product thesis: Voice as an interaction layer

The wrong framing is:

> Watchdog now has an AI voice assistant.

The better framing is:

> Watchdog Intelligence can now be spoken to and listened to while preserving the same evidence-backed operating model.

This distinction matters because the value is not speech itself. Modern browsers and many vendors can turn audio into text or text into audio. The differentiated value is what happens after transcription:

- Watchdog knows the governed property context;
- Watchdog can identify the relevant professional workflow;
- Watchdog can use approved tools;
- Watchdog can return explicit evidence and caveats;
- Watchdog can preserve lineage;
- Watchdog can apply plan, account, and organization rules;
- Watchdog can distinguish read-only actions from consequential operations;
- Watchdog can eventually connect safe spoken intent to the automation fabric.

Speech is therefore an **interface multiplier** for Watchdog Intelligence.

---

## 4. The canonical Voice pipeline

The target architecture should preserve one canonical sequence:

```text
user intent
  ↓
voice capture
  ↓
transcription
  ↓
visible transcript
  ↓
user review or explicit send
  ↓
Watchdog Analyst session
  ↓
approved tools + governed context
  ↓
structured Watchdog response
  ↓
written conclusion + evidence + caveats + sources + actions
  ↓
optional narration
```

For commands that may create work, the flow extends:

```text
spoken intent
  ↓
transcript
  ↓
Analyst interpretation
  ↓
proposed structured action
  ↓
permission + policy + plan check
  ↓
confirmation when required
  ↓
existing Watchdog action / Zapier / native integration
  ↓
audit + outcome
```

Voice should never introduce a side door around the existing execution path.

---

## 5. Context-aware conversation

The next meaningful advancement is not longer dictation. It is **context continuity**.

A professional reviewing a property should be able to ask:

- “Why is that important?”
- “What changed since last year?”
- “Compare that to the last sale.”
- “Is this unusual for the town?”
- “Show me the evidence.”
- “What would an investor care about here?”
- “Give me the attorney version.”
- “Summarize this for a client.”

The user should not need to repeat the address or restate the entire prior question when Watchdog already has an active, authorized session context.

### 5.1 Context sources

A Voice turn may inherit bounded context such as:

- current governed property ID;
- current comparison set;
- active Analyst session;
- currently displayed Watchdog finding;
- current report section;
- selected Data Center fields;
- active Watchlist item;
- current campaign draft;
- organization and profession context;
- plan and entitlement state.

### 5.2 Context must be explicit and inspectable

The Voice layer should not silently accumulate arbitrary browser state.

Each turn should be attributable to a known session/context envelope such as:

```json
{
  "session_id": "...",
  "property_ids": ["..."],
  "surface": "data_workbench",
  "active_artifact": "finding_or_report_id",
  "profession": "agent",
  "interaction_mode": "voice",
  "transcript_reviewed": true
}
```

The exact schema can evolve, but the principle should not.

---

## 6. Voice surfaces across Watchdog

Voice should appear where context is strong and the interaction benefit is obvious. It should not become a floating microphone on every page.

### 6.1 Ask Watchdog / Data Workbench

**Priority: highest**

Use cases:

- spoken property questions;
- follow-up questions;
- evidence requests;
- “what changed?” analysis;
- professional reframing;
- narrated answer playback.

This remains the reference implementation because the Analyst context already exists.

### 6.2 Full property report

Potential controls:

- “Explain this score.”
- “What are the three biggest issues?”
- “Read the key changes.”
- “What should an agent pay attention to?”
- “Summarize for a homeowner.”

The narration should be generated from the current structured report state, not from a fresh uncontrolled model call.

### 6.3 Compare

Voice can reduce friction when two or more properties are on screen:

- “Which has the higher tax burden?”
- “Which one has more evidence of recent change?”
- “Summarize the biggest differences.”
- “Read me the tradeoffs.”

The comparison set must be explicit so pronouns such as “this one” or “the second property” do not resolve ambiguously.

### 6.4 Watchlists

Useful prompts:

- “What changed today?”
- “Which saved property needs attention?”
- “Read the high-priority changes.”
- “Why did this move up?”

This can become one of the strongest recurring-value Voice surfaces because Watchlists naturally produce time-based change.

### 6.5 Daily and weekly Intelligence

A narrated digest can create habitual usage:

- morning professional brief;
- weekly Watchlist review;
- material-change recap;
- “top three items to review” summary.

Auto-play should remain off by default. The user should explicitly request or configure narration.

### 6.6 Data Center

For Pro+ and Teams, Voice can help interrogate dense data without turning the Data Center into a generic chatbot.

Examples:

- “Show only tax, assessment, permit, and sale-change fields.”
- “Which of these markers are stale?”
- “Explain why this derived marker is not LIVE.”
- “Summarize the strongest signals for this property.”

Any spoken UI command must map to explicit Data Center actions or Analyst tools rather than arbitrary DOM manipulation.

### 6.7 Marketing Studio

Voice can eventually assist with creative workflow without becoming an outbound calling product.

Possible uses:

- dictate a campaign objective;
- request a shorter or more professional brief;
- narrate a creative proof for review;
- produce a 15, 30, or 60 second governed social voiceover from an approved creative brief;
- approve a reversible draft state through an explicit confirmation UX.

Paid spend, campaign launch, bulk communication, or external delivery must preserve existing approval gates.

---

## 7. Narrated Intelligence, not generic text-to-speech

A simple “read this page aloud” feature is not enough.

Watchdog should define structured narration formats optimized for real professional use.

### 7.1 30-second property brief

Purpose: rapid orientation.

Suggested structure:

1. property identity;
2. Watchdog conclusion;
3. top two evidence points;
4. one caveat if material;
5. one recommended next review action.

### 7.2 60-second professional brief

Purpose: deeper review while remaining concise.

Suggested structure:

1. conclusion;
2. key material changes;
3. evidence freshness;
4. profession-specific implications;
5. caveats;
6. suggested action.

### 7.3 Watchdog Score explanation

Purpose: make the score understandable rather than simply announcing a number.

Narration should explain:

- what moved the score;
- which evidence is strongest;
- which components are uncertain;
- whether the score changed over time;
- what the user should investigate next.

### 7.4 Evidence-change summary

Purpose: answer “what changed?”

The brief should prioritize new, removed, strengthened, weakened, or stale evidence rather than re-reading the full property profile.

### 7.5 Comparison narration

Purpose: communicate tradeoffs among explicitly selected properties.

The output should distinguish facts from interpretation and should not imply a recommendation outside the user's authorized professional context.

### 7.6 Daily Intelligence audio digest

Purpose: recurring paid-plan value.

Possible format:

- number of meaningful changes;
- top three items;
- one emerging trend;
- one unresolved item;
- direct links in the written UI for follow-up.

The audio is a summary. The written digest remains the source of record.

---

## 8. Safe spoken commands

Voice becomes materially more valuable when it can do more than ask questions. It also becomes materially more dangerous if command classes are not explicit.

Watchdog should classify spoken actions before implementing them.

### 8.1 Class A: read-only navigation

Examples:

- open evidence;
- show property history;
- switch to comparison;
- open Watchlist;
- filter the current view;
- read the current brief.

These may execute immediately when the target is unambiguous and the action is harmless.

### 8.2 Class B: reversible internal writes

Examples:

- add property to Watchlist;
- remove a temporary filter;
- create a draft internal task;
- save a comparison set;
- tag an internal Watchdog item.

These may use lightweight confirmation depending on context and reversibility.

### 8.3 Class C: approval-required external or consequential action

Examples:

- send a client message;
- schedule a newsletter;
- launch a paid campaign;
- submit or initiate a legal workflow;
- publish content;
- modify billing;
- delete significant records;
- create an external CRM mutation with material downstream effect.

Voice may prepare the action, but the existing approval mechanism remains authoritative.

### 8.4 Class D: prohibited by Voice

Examples:

- reveal credentials;
- bypass plan restrictions;
- change RLS or entitlement policy;
- authorize unrestricted provider access;
- perform destructive administration merely because a user spoke a phrase;
- make a high-impact professional decision without the required evidence or approval.

The command taxonomy should be versioned and testable.

---

## 9. Voice-triggered automation

Voice and the Watchdog Automation Fabric are complementary when the boundary is clear.

The automation whitepaper proposes evidence-aware operations, policy gates, approval tiers, and reconstructable actions. Voice can become one input channel into that system.

Example:

> “When any property in this Watchlist gets a high-confidence assessment change, create a review task for me and draft a client brief, but do not send it.”

Watchdog should not immediately build an automation from that sentence.

It should produce a structured proposal:

```text
Intent detected: create monitored assessment-review workflow
Scope: current Watchlist
Trigger: governed assessment material change
Confidence threshold: high
Actions:
  1. create internal review task
  2. draft client brief
External send: disabled
Approval: required before any client communication
Estimated event volume: pending simulation
```

The user reviews the plan. The existing Automation Fabric then owns execution.

This is the correct relationship:

**Voice captures intent. Analyst interprets intent. Policy constrains intent. Automation executes approved structure.**

---

## 10. Browser-native speech vs provider speech

Watchdog should maintain two broad execution paths.

### 10.1 Browser-native path

Advantages:

- low or zero direct provider cost;
- no Watchdog raw-audio upload on the primary flow;
- fast path for supported browsers;
- simple failure isolation;
- useful for proving product demand before adding paid speech infrastructure.

Limitations:

- browser support differences;
- inconsistent voice quality;
- less control over recognition models;
- potential platform-specific behavior;
- weaker observability into underlying recognition quality;
- limited guarantees for mobile and language parity.

### 10.2 Server/provider path

Advantages:

- more consistent model selection;
- better cross-browser parity;
- richer language support;
- stronger model-level telemetry;
- potential streaming and timestamp support;
- potentially better transcription accuracy and TTS quality.

Limitations:

- direct cost;
- provider availability risk;
- credential management;
- potential audio transfer outside the browser;
- additional privacy and retention review;
- billing surprises if promotion or pricing behavior changes.

### 10.3 Default-selection rule

Do not switch the primary path based on demo quality alone.

Benchmark:

- word error rate or practical transcript correction rate;
- end-to-end latency;
- completion rate;
- user abandonment;
- mobile/browser coverage;
- provider failure rate;
- cost per completed Voice interaction;
- privacy and retention posture.

Then choose the default by measured product value.

---

## 11. Privacy and retention doctrine

Voice creates a stronger perception of intimacy than typed input. The privacy boundary must therefore be easier to understand, not harder.

### 11.1 Raw microphone audio

Default rule:

**Do not retain raw microphone audio.**

If a future feature requires retention, it needs:

- an explicit purpose;
- explicit user consent;
- a stated retention period;
- deletion controls;
- encryption and access policy;
- provider-retention review;
- a reason that cannot be satisfied by retaining the transcript alone.

### 11.2 Transcript

A transcript is treated as user input to Watchdog Intelligence and should follow the same session, authorization, and audit model as typed content.

The user should see the transcript before submission where the product experience allows it.

### 11.3 Spoken output

Narrated output should be derived from already-authorized Watchdog content. Voice should not cause additional sensitive fields to be exposed merely because audio playback is available.

### 11.4 Microphone permissions

Watchdog should:

- request microphone access only after an explicit user action;
- show a visible recording state;
- provide a clear stop control;
- avoid always-listening behavior by default;
- explain when recognition is browser-native vs provider-mediated if the difference affects privacy.

---

## 12. Security and authorization

Voice must inherit all Watchdog Intelligence controls.

### 12.1 Authentication

Every server-mediated Voice operation should bind to the authenticated Watchdog user.

### 12.2 Plan and add-on entitlement

The entitlement model remains:

| Plan | Voice Intelligence |
|---|---|
| Standard / Free | unavailable |
| Agent | Watchdog Intelligence add-on |
| Pro | Watchdog Intelligence add-on |
| Pro+ | included |
| Teams | included by default |
| Developer | controlled internal access |

The UI should not be the enforcement boundary.

### 12.3 Tool authorization

A spoken request uses the same approved Analyst tools as a typed request. Voice does not gain raw SQL, service-role access, or unrestricted data retrieval.

### 12.4 Action authorization

Every Voice-triggered write should be mapped to an existing capability or new explicitly reviewed capability.

### 12.5 Prompt-injection and quoted speech

Voice introduces another source of untrusted text. Transcripts may contain instructions copied from another person, a recording, a television, a web page, or malicious content.

The system must treat transcribed text as user-supplied content, not privileged instructions.

---

## 13. Accessibility

Voice can be an accessibility improvement only if it is optional and paired with visible alternatives.

Requirements should include:

- keyboard-operable controls;
- screen-reader labels;
- visible recording state;
- live status text;
- transcript display;
- stop/cancel controls;
- typed fallback;
- no audio-only evidence;
- no required listening for critical information;
- reduced-motion compatibility;
- touch targets sized for mobile use.

Speech should expand access, not create a second inaccessible mode.

---

## 14. Mobile product direction

Voice is especially valuable on mobile because typing complex property questions is slower and users may be moving between properties, vehicles, meetings, or showings.

The mobile interaction should be deliberately compact:

1. tap Voice;
2. visible listening state;
3. speak;
4. tap Stop or auto-stop after a bounded window;
5. transcript appears;
6. user edits if needed;
7. Ask Watchdog;
8. written response appears;
9. optional Listen control.

Future mobile work can evaluate:

- hold-to-talk;
- lock-to-record;
- haptic start/stop cues;
- waveform or simple listening indicator;
- one-handed placement;
- interruption handling;
- Bluetooth microphone behavior;
- car audio behavior only if it can be made safe and non-distracting.

Hands-free continuous conversation should remain research until privacy and accidental-activation controls are strong enough.

---

## 15. Voice preferences

A paid Intelligence experience can eventually support user preferences without turning Voice into a settings maze.

Candidate preferences:

- speech rate;
- concise vs detailed narration;
- preferred available browser/provider voice;
- auto-play off by default;
- preferred transcript language;
- whether Listen buttons are shown by default;
- whether Voice controls are expanded or compact.

Voice cloning should not be a normal preference.

---

## 16. Multilingual research

Multilingual Voice is promising but must not outrun evidence fidelity.

A spoken question in another language can be supported only if Watchdog can preserve:

- property identity;
- source meaning;
- uncertainty language;
- professional caveats;
- citation references;
- distinction between fact and recommendation.

A translated narration must not imply that a source document itself was published in the translated language or that legal terminology has an identical jurisdictional meaning.

Research should compare:

- recognition accuracy by language;
- translation fidelity;
- professional terminology;
- source citation usability;
- TTS quality;
- support burden;
- market demand.

---

## 17. Product telemetry

Voice needs a product funnel, not merely infrastructure metrics.

### 17.1 Input funnel

Track events such as:

- Voice control viewed;
- Voice started;
- permission denied;
- recognition started;
- recognition completed;
- recognition failed;
- transcript produced;
- transcript edited;
- transcript abandoned;
- transcript submitted to Analyst;
- Analyst response completed.

### 17.2 Output funnel

Track:

- Listen shown;
- Listen started;
- playback completed;
- playback stopped early;
- narration error;
- follow-up question after narration.

### 17.3 Business metrics

Measure:

- Voice adoption by eligible plan;
- active Voice users per week/month;
- percentage of Intelligence sessions using Voice;
- add-on conversion for Agent/Pro;
- Pro+ and Teams retention correlation;
- number of follow-up turns per Voice session;
- narrated digest engagement;
- provider/browser quality differences;
- cost per completed provider-mediated interaction.

### 17.4 Quality metric: transcript correction rate

One of the best practical signals is whether users edit the transcript before submitting it.

A high correction rate may reveal:

- poor recognition;
- address transcription problems;
- property-specific terminology errors;
- noisy mobile environments;
- language mismatch.

Do not store sensitive edit history merely for analytics. Capture the minimum derived metric needed to evaluate quality.

---

## 18. Economics and packaging

Voice should support the Watchdog Intelligence commercial layer rather than creating a separate audio billing problem.

### 18.1 Packaging direction

Maintain the initial model unless product data supports change:

- Agent: Watchdog Intelligence add-on;
- Pro: Watchdog Intelligence add-on;
- Pro+: included;
- Teams: included;
- Standard / Free: unavailable.

### 18.2 Why not sell minutes

Per-minute billing makes Voice feel like a utility and discourages use. The more valuable behavior is repeated use of Watchdog Intelligence.

A better commercial model is:

- generous usage limits;
- abuse and cost controls behind the scenes;
- user-facing value positioned around Intelligence capabilities;
- periodic pricing review based on real adoption and provider cost.

### 18.3 Add-on value should extend beyond Voice

The Agent/Pro Watchdog Intelligence add-on should bundle the broader Intelligence experience, with Voice as an important interaction benefit rather than the whole SKU.

Possible bundled value:

- Ask Watchdog;
- Voice input;
- narrated briefs;
- what-changed summaries;
- professional framing;
- Daily Intelligence;
- advanced Watchlist explanations;
- future contextual follow-up.

---

## 19. Reliability and graceful degradation

Voice should fail independently.

Possible states:

1. **Full Voice available** - input and narration available.
2. **Input only** - speech recognition available, narration unavailable.
3. **Narration only** - text input remains, Listen works.
4. **Provider fallback active** - server provider is used because browser path is unsupported.
5. **Typed Intelligence only** - Voice unavailable, Analyst remains fully usable.

A speech outage must not disable property Intelligence.

Operators need kill switches for:

- all Voice;
- browser Voice decorator if a browser regression appears;
- individual provider path;
- transcription only;
- TTS only;
- individual plan exposure if required during a pilot.

---

## 20. Testing strategy

### 20.1 Contract tests

Voice contract tests should verify:

- Standard/Free denial;
- Agent/Pro add-on behavior;
- Pro+/Teams inclusion;
- transcript review before Analyst submission;
- no direct Voice bypass to Analyst tools;
- spoken output derives from governed written response;
- raw-audio non-retention boundary;
- daily usage controls;
- typed fallback if Voice is disabled;
- provider-specific failure isolation.

### 20.2 Browser tests

Test current target browsers on:

- microphone permission;
- recognition start/stop;
- no-speech behavior;
- denied permission;
- transcript insertion;
- follow-up turns;
- speech synthesis start/stop;
- navigation while speaking;
- tab visibility changes;
- mobile viewport behavior.

### 20.3 Property-language fixtures

Speech recognition should be tested with realistic New Jersey property vocabulary:

- municipality names;
- block and lot references;
- tax terminology;
- assessment terminology;
- street names;
- acronyms;
- professional vocabulary.

### 20.4 Command safety tests

For each spoken command class, verify:

- ambiguous targets fail closed;
- permission denial is respected;
- confirmation appears where required;
- actions are idempotent where relevant;
- Voice cannot skip a payment or communication approval step;
- audit lineage records the spoken interaction mode.

---

## 21. Phased roadmap

### Phase 1: v1 foundation - shipped

- paid-plan Voice packaging;
- microphone input;
- transcript review;
- governed Analyst submission;
- spoken response playback;
- no raw-audio retention by default;
- usage telemetry;
- browser-native zero-spend primary path;
- provider fallback architecture.

Primary issue: NJW-263.

### Phase 2: contextual Voice

- follow-up questions inside Analyst sessions;
- current-property context retention;
- clearer transcript lineage;
- Voice session telemetry.

### Phase 3: structured narration

- 30-second property brief;
- professional brief;
- Watchdog Score explanation;
- what-changed narration;
- comparison narration.

### Phase 4: cross-surface Voice

- report pages;
- Watchlists;
- Compare;
- Daily Intelligence;
- selected Data Center flows;
- selected Marketing Studio review flows.

### Phase 5: command taxonomy

- read-only commands;
- reversible internal commands;
- confirmation UX;
- prohibited-action enforcement;
- audit metadata.

### Phase 6: provider benchmarking

- browser-native baseline;
- intentionally funded provider pilot;
- quality/cost matrix;
- mobile coverage;
- multilingual research.

### Phase 7: governed Voice automation

- spoken workflow intent;
- structured proposed automation;
- policy simulation;
- explicit approval;
- existing Automation Fabric execution.

Primary follow-on issue: NJW-265.

---

## 22. Research agenda

### Research 1: Voice Property Copilot without a second agent

Can Watchdog create a fluid conversational experience while preserving one canonical Analyst runtime and one evidence contract?

Success means the experience feels conversational without creating a hidden parallel decision system.

### Research 2: Evidence-aware interruption

If the user interrupts narration with “why?” or “show me the source,” can Watchdog pause playback, retain context, and immediately shift to the relevant evidence view?

### Research 3: Voice summaries that improve decisions

Which narration formats cause users to open evidence, save properties, create tasks, or continue investigation rather than merely listen passively?

### Research 4: Context compression

How much session context can be safely retained between spoken turns without making the user's mental model unclear or increasing incorrect pronoun/reference resolution?

### Research 5: Professional brief modes

Can the same governed property evidence produce useful distinct narrations for:

- agent;
- attorney;
- investor;
- lender;
- appraiser;
- homeowner;

without inventing profession-specific facts?

### Research 6: On-device and privacy-preserving speech

As browser and device speech APIs improve, Watchdog should evaluate whether more recognition can remain local while preserving acceptable quality.

### Research 7: Voice as an automation compiler input

Can a spoken business objective become a reviewable, simulated, policy-constrained automation plan rather than an immediate command?

This research directly connects to the Watchdog Automation Fabric whitepaper.

---

## 23. Explicit non-goals

Watchdog Intelligence Voice is not currently intended to become:

- an autonomous outbound robocaller;
- a cold-calling real estate bot;
- a generalized voice-cloning platform;
- an always-listening sitewide microphone;
- a podcast production product;
- an audio-only evidence system;
- a replacement for written reports;
- a mechanism to bypass Watchdog plan restrictions;
- a mechanism to bypass RLS, entitlement, approval, or professional safeguards.

Future research should be evaluated against these boundaries before broadening the product definition.

---

## 24. Governance rule for this whitepaper

This is a living architecture and product-direction document.

It should be updated when:

- a new Voice surface ships;
- entitlement or packaging changes;
- a provider becomes the production default;
- raw-audio handling changes;
- multilingual support is promoted from research;
- spoken commands are given write authority;
- Voice-triggered automation becomes executable;
- telemetry materially changes the product thesis.

Future capabilities must be labeled as future capabilities until verified in production.

The code, Supabase policies, current entitlement contract, and production runtime remain authoritative over this document.

---

## 25. Closing position

The long-term opportunity is not to make Watchdog talk.

It is to make high-value property Intelligence easier to access in the moments when typing and scanning are inefficient, while preserving the evidence discipline that makes Watchdog useful in the first place.

The strongest product will let a user move naturally between:

**see → ask → speak → inspect evidence → listen → compare → approve → act**

without ever changing the underlying trust model.

That is the standard for Watchdog Intelligence Voice.
