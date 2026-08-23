# Watchdog Intelligence Voice vNext Narration Runbook

**Issue:** NJW-265  
**Shipped contract:** `watchdog-narration-vnext-1`  
**Voice engine:** `watchdog-intelligence-voice-vnext-narration-1`  
**Canonical domain:** `https://www.watchdogindex.com`  
**Date:** 2026-08-23

## Purpose

Structured narration is a presentation layer over the existing governed Watchdog Intelligence response. It is not a second assistant, a new evidence source, or a separate model interpretation step.

The written Watchdog response remains authoritative. Narration is built deterministically from fields already rendered in that response:

- conclusion;
- evidence;
- missing evidence;
- caveats;
- visible source labels.

The formatter performs no network call and no language-model call.

## Production formats

### Quick · ~30 sec (`quick`)

Use for rapid orientation.

Order:
1. governed conclusion;
2. top two evidence items;
3. first caveat, or first evidence gap when no caveat is present.

Character ceiling: 900.

### Professional · ~60 sec (`professional`)

Use for a deeper professional review.

Order:
1. governed conclusion;
2. top four evidence items;
3. up to two missing-evidence items;
4. up to two caveats.

Character ceiling: 1,800.

### Evidence & sources (`evidence`)

Use when reviewing a finding, asking why something was flagged, or inspecting source lineage.

Order:
1. governed conclusion;
2. up to four evidence items;
3. up to three missing-evidence items;
4. up to four visible source labels from the written response;
5. up to two caveats.

Character ceiling: 2,100.

`inspect_lineage` responses default to this format. The written source links remain the evidence record; spoken source labels do not replace them.

### What changed (`changes`)

Use for Daily Intelligence, Watchlist/change-oriented surfaces, or a user prompt explicitly asking what changed.

Order:
1. governed conclusion;
2. up to three material evidence items;
3. up to two unresolved or missing-evidence items;
4. first caveat when present.

Character ceiling: 1,600.

## Availability and default-selection rules

Quick and Professional are available for any eligible governed written response.

Evidence & sources is offered when the response includes evidence or source labels, or when the response is an `inspect_lineage` review. It is the default for `inspect_lineage`.

What changed is offered on Daily/Watchlist context or when the preceding user prompt asks about change, changed items, latest items, or material movement. It becomes the default for an explicit change-oriented request.

No narration autoplays. The user explicitly chooses Listen and can change the narration format before playback.

## Browser-primary path

Where browser Web Speech APIs are supported and the account is eligible:

1. Watchdog extracts the already-rendered written Analyst fields.
2. `watchdog-intelligence-narration.js` renders the selected deterministic format.
3. browser `speechSynthesis` speaks that text.
4. no microphone recording is uploaded for browser-native recognition.
5. transcript review remains required before a spoken question is submitted to Ask Watchdog.

Browser narration telemetry records only bounded operational metadata, never the answer text or transcript:

- narration format;
- narration contract version;
- browser speech engine;
- narration character count;
- Watchdog surface;
- start / completion / explicit stop / failure event.

## Provider fallback path

The existing `/api/watchdog-intelligence-voice` fallback uses the same `watchdog-intelligence-narration.js` formatter before speech generation.

The provider receives only the deterministic narration text produced from the governed written response. The provider is not asked to summarize, reinterpret, or add facts.

Server speech telemetry records narration format/version, character count, output-size estimate, provider/model, latency, packaging state, and `raw_audio_persisted: false`.

Current provider billing guard remains fail-closed to the configured `-free` Fish Audio model identifiers unless separately reviewed and intentionally changed.

## Entitlement and authorization boundary

Narration does not change Watchdog Intelligence eligibility.

- Standard: no Voice entitlement.
- Agent / Pro: requires the active Watchdog Intelligence add-on where applicable.
- Pro+ / Teams: included under the existing plan boundary.
- Developer role remains governed by the existing entitlement contract.

Browser telemetry and provider fallback continue to resolve the signed-in user and server-owned entitlement state before accepting Voice usage.

Narration does not bypass the Analyst session, approved tool router, RLS, source lineage, or any confirmation/action policy.

## Privacy and retention

- raw browser microphone audio is not retained by Watchdog;
- provider fallback does not persist raw audio;
- narration events do not store transcript text;
- narration events do not store written-answer text;
- source URLs are not copied into narration telemetry;
- the written response remains the source of record.

## Accessibility and human control

- narration format is selectable with a native keyboard-accessible select;
- Listen controls retain visible focus treatment;
- mobile controls preserve a 44px interaction target;
- each format has an accessible narration-purpose label;
- no autoplay;
- users can stop narration;
- written evidence remains visible while narration is optional;
- typed Watchdog Intelligence remains functional if speech APIs/providers are unavailable.

## Verification contract

Run from repository root:

```bash
node property/tests/watchdog-intelligence-narration-contract.mjs
node property/tests/watchdog-intelligence-voice-contract.mjs
node property/tests/watchdog-contextual-voice-contract.mjs
```

Expected production invariants:

- four narration formats are available in `watchdog-narration-vnext-1`;
- formatter has no `fetch`/provider/model call;
- browser and provider fallback both use the shared formatter;
- spoken questions still require transcript review before Analyst submission;
- browser-primary Voice does not upload microphone audio;
- narration events contain bounded metadata only;
- no autoplay is introduced;
- existing Watchdog Intelligence plan and add-on gates remain intact.

## Operational rollback

If narration formatting regresses:

1. disable or revert only the narration UI/formatter release;
2. leave typed Analyst and governed written responses available;
3. do not weaken entitlement or RLS controls to restore Voice;
4. preserve the Voice rollout kill switch;
5. review recent `voice_narration_*` and `voice_speech` telemetry for the affected surface and engine before re-enabling.

## Known boundaries after this increment

This runbook certifies the structured narration increment only. NJW-265 remains broader than narration and should remain In Progress until its remaining acceptance criteria, including the complete spoken-command taxonomy, broader Voice funnel/quality program, and browser-vs-provider benchmark, are separately evidenced.
