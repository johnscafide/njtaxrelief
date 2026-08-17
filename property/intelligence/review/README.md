# Watchdog Intelligence Preview Review

This directory is the versioned review surface for the Watchdog Intelligence program.

## Purpose

The review page exists so Phases 1-6 can be reviewed from an official Vercel Preview deployment without merging the Intelligence feature branch into production or changing the production Supabase project.

The review surface is `noindex,nofollow` and uses representative data from staging acceptance evidence. It does not claim that preview/uncalibrated models are production-ready.

## Official preview deployment pattern

The Vercel preview belongs to the existing `njtaxrelief` project and contains a very small loader page. The loader fetches:

`https://raw.githubusercontent.com/johnscafide/njtaxrelief/feature/watchdog-intelligence-foundation/property/intelligence/review/index.html`

Because the loader reads the feature branch at runtime, updates to this review page appear on the same Vercel deployment URL without merging `main` or changing the production alias.

The deployment must target **preview**, never production.

## What the review covers

- Phase 1: foundation, evidence contract, immutable model versions, RLS/trust premise
- Phase 2: deterministic model engine, Assessment/Closing/Change models, normalizer, trusted evidence batches and calibration status
- Phase 3: Data Workbench Intelligence, Priority Queue, Evidence Drawer and downstream actions
- Phase 4: Ask Watchdog / governed Analyst tool boundary and fail-soft deterministic behavior
- Phase 5: Opportunity Value, outcome capture and bounded first-party preference learning
- Phase 6: population jobs, caching, Daily Intelligence, Teams, Cron scheduling, quotas and developer operations
- Human calibration gates and production-promotion status

## Safety boundary

This review page is not the production application. It must not contain production service-role credentials, hidden bypass tokens, private customer data, or an authentication bypass to production/staging databases.

Actual production promotion remains governed by the Phase 2 calibration gate and the Phase 6 promotion/rollback runbook.