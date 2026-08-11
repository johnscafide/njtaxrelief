# Watchdog data-use position

Watchdog is built to explain New Jersey property-tax and assessment records. It does not sell or enrich owner phone numbers, personal email addresses, skip-trace results, dialing lists, or other consumer-contact data for arbitrary parcels.

## Product boundary

Allowed:

- A professional may upload their own sphere, CRM contact reference, or relationship identifier.
- Watchdog may match that user-supplied reference to a property record and return property-derived facts, assessment context, municipal signals, and sourced reasons to review the property.
- Watchdog may export the user's own contact reference alongside property intelligence so the user can reconnect the record inside their own CRM.

Not part of the product:

- Returning a phone number or personal email address for an arbitrary parcel.
- Bulk owner-contact enrichment or skip tracing.
- Selling dialing lists, DNC screening, carrier verification, or consumer-contact profiles.
- Inferring that an owner intends to sell, refinance, appeal, or otherwise take an action based on private contact data.

## Why this boundary exists

New Jersey has heightened privacy and compliance considerations around protected address and personal information, including Daniel's Law. Watchdog's safer and more defensible role is to interpret property records and let professionals use relationships and contact data they already possess lawfully, rather than becoming a reseller of personal-contact data.

This is also a product-positioning choice. Watchdog competes on assessment interpretation, Chapter 123 context, municipal and revaluation signals, evidence, and professional workflow—not on skip tracing.

## Future partner path

If customers later require contact enrichment, the preferred model is a direct relationship between the customer and a specialized compliant provider. Watchdog should pass a parcel identifier or workflow handoff where appropriate, but should not ingest, store, or resell the partner's consumer-contact dataset by default.

This document is a product policy, not legal advice. Counsel should review material changes to this boundary before launch of any owner-contact feature.
