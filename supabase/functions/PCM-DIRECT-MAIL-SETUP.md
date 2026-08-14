# PCM Direct Mail setup

The Watchdog Data Workbench PCM integration is deployed with paid submission locked until PCM credentials are added as Supabase Edge Function secrets.

Use one of these authentication modes:

- `PCM_ACCESS_TOKEN`: a PCM bearer token.
- Or `PCM_API_KEY`, `PCM_API_SECRET`, and `PCM_TOKEN_URL`: the PCM portal API key/secret and the access-token endpoint. `PCM_CHILD_REF_NBR` is optional for a child account.

Provider routing defaults to the currently documented direct-mail order shape used by PCM Integrations:

- `PCM_API_BASE_URL` defaults to `https://api.pcmintegrations.com/v2/directmail-api`.
- `PCM_ORDER_PATH` defaults to `/order`.

Both can be overridden without changing source code if PCM changes the route for the v3 documentation set.

## Pricing safety

Watchdog will not submit a paid order unless pricing is explicitly configured.

Preferred setting:

- `PCM_PER_PIECE_ESTIMATE_CENTS`: integer cents per postcard based on the connected PCM account rate. Watchdog multiplies this by the validated recipient count and shows the estimate before final confirmation.

Emergency/intentional override only:

- `PCM_ALLOW_UNPRICED_ORDERS=true`: permits paid submission while displaying that the exact total is not available in Watchdog. Leave this unset or false by default.

## Privacy boundary

Only property mailing addresses are sent to PCM. The provider recipient label is `Current Resident`. The integration does not send Watchdog owner demographics, household attributes, financial profile fields, or person-level advertising attributes.

## User flow

1. Select visible properties in Data Workbench.
2. Click **Direct Mail**.
3. Enter an approved PCM design ID and mail class.
4. Save a draft. Address validation and duplicate removal happen before the draft is stored.
5. Review recipient count and estimated cost.
6. Explicitly confirm the paid order.
7. The `pcm-direct-mail` Edge Function submits the provider order and records the PCM order/batch identifiers plus an audit timeline.

CSV export remains available as a fallback whether PCM is connected or not.
