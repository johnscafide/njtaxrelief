# Transaction evidence acquisition

Watchdog's transaction evidence layer is source-first. A source URL is not a clearance result, a missing provider is never treated as clean, and credentialed/premium systems are never bypassed.

## Automated statewide sources

| Evidence family | Publisher | Acquisition | Current source |
| --- | --- | --- | --- |
| Assessment, tax baseline, deed reference, tax account, MOD-IV delinquent/bill flags | NJ Division of Taxation | Download current MOD-IV archive | https://www.nj.gov/treasury/taxation/lpt/statdata.shtml |
| MOD-IV fixed-width schema | NJ Division of Taxation | Direct download | https://www.nj.gov/treasury/taxation/pdf/lpt/modivlayout.pdf |
| County/municipality codes | NJ Division of Taxation | Direct XLSX | https://www.nj.gov/treasury/taxation/documents/excel/lpt/CDcodes.xlsx |
| Sale/deed parties and recording references | NJ Division of Taxation | Discover current Year-to-Date SR-1A link | https://www.nj.gov/treasury/taxation/lpt/statdata.shtml |
| SR-1A schema | NJ Division of Taxation | Direct download | https://www.nj.gov/treasury/taxation/pdf/lpt/SR1Afilelayout.pdf |
| Construction permits/certificates | NJ DCA | Paginated public Socrata API | https://data.nj.gov/resource/w9se-dmra.json |
| Parcel identity / block / lot / assessment context | NJ Office of GIS | Query live ArcGIS service | https://www.nj.gov/njgin/edata/parcels/ |
| Public-entity legal-notice pages | NJ Department of State | Crawl centralized directory | https://www.nj.gov/state/statewide-legal-notices-list.shtml |
| Municipal website seed list | State of New Jersey | Crawl directory, then same-site discovery | https://www.nj.gov/nj/gov/county/localgov.shtml |
| Municipality/code lookup | State of New Jersey | Search/reference | https://www.nj.gov/nj/gov/direct/municipality.shtml |

`property/scripts/acquire_transaction_sources.py` downloads the public statewide files and emits a hash/audit report. `property/scripts/discover_municipal_transaction_sources.py` inventories candidate municipal pages for CO/resale, smoke/fire, tax, tax sale, water/sewer, construction, and code enforcement. Discovery candidates must be reviewed/parsed before Watchdog claims a requirement.

## Licensed / credentialed public-record sources

| Evidence family | Access path | Watchdog rule |
| --- | --- | --- |
| UCC financing / possible solar security interest | NJ UCC Bulk Data: https://www.njportal.com/Ucc/SearchBulk/Search.aspx | Purchase/use authorized bulk results. Do not infer real-estate lien from UCC match alone. |
| Judgments / judgment liens | NJ Judiciary Civil / Judgment Docket: https://www.njcourts.gov/courts/civil | Prefer Judiciary Electronic Access Program or authorized batch reports for continuous commercial use. Identity matching required. |
| County deed/mortgage/lien/lis pendens documents | County Clerk systems | Use county/vendor API, bulk agreement, or paid account where required. Never scrape around CAPTCHA/premium controls. |

A county record can be public while its electronic index/API is still subject to a vendor subscription or access agreement. `None found` may be displayed only after the authoritative record family was actually searched successfully.

## Solar account linking

Solar balances and payoff/transfer obligations are generally private customer-account data, not a statewide public dataset. The transaction UI should use a provider connection workflow rather than treating an account number as public lookup data.

Recommended UI contract:

1. Select solar company.
2. Enter provider identifier (account number, SystemID, site ID, or agreement number as appropriate).
3. Click **Connect account**.
4. Watchdog launches the provider-supported authorization method: OAuth, customer OTP/magic link, provider partner authorization, or secure statement upload.
5. After authorization, Watchdog stores provider tokens server-side and transaction evidence stores only normalized results and source timestamps.
6. Pull and display, when the provider contract permits it: current balance, payoff amount, lease/PPA/loan/owned status, transfer requirements, next payment, statement date, and evidence/document reference.

Provider starting points:

- Sunrun customer portal: https://my.sunrun.com/
- Sunrun service transfer: https://servicetransfer.sunrun.com/signin
- Sunrun Customer OnDemand API: https://docs.customer-api.sunrun.com/ — public documentation currently describes site/telemetry data; do not assume billing/payoff access without a billing/partner contract.
- Tesla account: https://www.tesla.com/teslaaccount
- Tesla solar billing support: https://www.tesla.com/support/energy/solar-panels/after-installation/billing
- Tesla property/title support: https://www.tesla.com/support/energy/solar-panels/documents/property-title
- Sunnova customer portal: https://account.sunnova.com/
- Enphase developer API: https://developer-v4.enphase.com/ — OAuth system-owner authorization; telemetry/system data is not financing payoff data.

**Account number alone is not a safe universal authentication method.** A provider may require account holder name, ZIP, one-time code, login authorization, or OAuth. Watchdog must use the provider's supported customer-consent flow rather than store customer passwords.

## Owner names — professional test policy

For the current test phase, owner-name display is allowed only for professional plans: `agent`, `pro`, `pro_plus`, `teams`, and `developer`. Standard/homeowner users do not receive owner names.

This entitlement does not override source privacy rules. NJGIN states that owner names are redacted from its hosted parcel and tax-list downloads, services, and applications pursuant to its Daniel's Law handling. Watchdog must not reconstruct a name that the authoritative source intentionally suppresses. A lawful unredacted assessor/MOD-IV/record provider may be connected later with protected-person handling and auditability.

Owner mailing address remains a separate, more sensitive field and is not automatically opened by the Agent owner-name test policy.

## Automation cadence

`.github/workflows/transaction-source-acquisition.yml` currently runs:

- daily: current public state-file acquisition;
- weekly: complete DCA permit snapshot;
- weekly: statewide municipal source discovery;
- manual: all three jobs on demand.

Raw acquisition artifacts are short-lived CI artifacts. Production ingestion should promote only validated data/revisions into the governed Watchdog warehouse with release/source metadata rather than serving arbitrary downloaded files directly.
