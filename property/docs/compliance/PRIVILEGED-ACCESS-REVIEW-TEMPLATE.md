# Watchdog Privileged Access Review — Evidence Template

Use this template for periodic and out-of-cycle privileged-access reviews. Keep committed copies sanitized: do not include names, emails, user IDs, tokens, credentials, private provider URLs, or exploit-enabling detail.

## Review metadata

- **Review date:** YYYY-MM-DD
- **Reviewer role:**
- **Review type:** Quarterly / material change / incident follow-up / offboarding / other
- **Systems in scope:**
- **Prior review date:**
- **Next planned review:**

## Human privileged access summary

| System | Privileged role/class | Active count | Business need confirmed | MFA/AAL2 status | Stale/inactive access found | Action |
|---|---|---:|---|---|---|---|
| Watchdog application | Developer | | Yes/No | Enforced/Partial/Unknown | Yes/No | |
| Supabase | Administrative/operator | | Yes/No | Enforced/Partial/Unknown | Yes/No | |
| GitHub | Repository/organization admin | | Yes/No | Enforced/Partial/Unknown | Yes/No | |
| Vercel | Project/team admin | | Yes/No | Enforced/Partial/Unknown | Yes/No | |
| Payment provider | Administrative/operator | | Yes/No | Enforced/Partial/Unknown | Yes/No | |
| Other Tier 1 provider | | | Yes/No | Enforced/Partial/Unknown | Yes/No | |

## Machine privilege summary

| Privilege class | Active count/class | Server-only confirmed | Rotation/revocation path known | Caller authorization reviewed | Action |
|---|---:|---|---|---|---|
| Supabase service-role usage | | Yes/No | Yes/No | Yes/No | |
| Webhook secrets | | Yes/No | Yes/No | Yes/No | |
| Connector/provider credentials | | Yes/No | Yes/No | Yes/No | |
| Deployment/API automation credentials | | Yes/No | Yes/No | Yes/No | |

## Joiner / mover / leaver check

- New privileged access since prior review:
- Privilege changes since prior review:
- Privilege removals since prior review:
- Departed/inactive access verified removed:
- Temporary/emergency privilege still active:
- Exceptions requiring follow-up:

## Application authorization evidence

- Server-side developer-role check still present: Pass / Fail
- Browser cannot self-promote role/plan through profile update: Pass / Fail
- Developer-only APIs independently authorize server-side: Pass / Fail
- New service-role-backed functions reviewed for caller authorization: Pass / Fail / None added
- New internal/admin surfaces reviewed: Pass / Fail / None added

## Findings and remediation

| Finding | Risk | Action completed / required | Owner role | Due / completed date | Status |
|---|---|---|---|---|---|
| | | | | | |

## Conclusion

- **Review result:** Pass / Pass with exceptions / Fail
- **Material access removed during review:** Yes / No
- **Residual risk:**
- **Next no-cost action:**

## Evidence references

List only sanitized evidence paths, issue/commit references, or private-system evidence identifiers that do not reveal secrets or personal data.

- 
