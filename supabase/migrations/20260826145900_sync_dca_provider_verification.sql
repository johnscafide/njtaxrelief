with eligible as (
  select c.marker_id, max(r.last_checked_at) as checked_at
  from public.data_center_provider_coverage c
  join public.dca_source_registry r on r.source_id = any(c.source_keys)
  where c.value_status = 'live'
    and r.source_status = 'live'
    and r.authoritative = true
    and r.last_checked_at is not null
  group by c.marker_id
)
update public.data_center_provider_coverage c
set last_verified_at = greatest(c.last_verified_at, e.checked_at),
    notes = case
      when e.checked_at > c.last_verified_at
      then concat_ws(' ', c.notes, '[2026-08-26] Provider verification synchronized to newer authoritative DCA source-registry check.')
      else c.notes
    end
from eligible e
where c.marker_id = e.marker_id
  and e.checked_at > c.last_verified_at;

select public.refresh_data_center_source_currency_metrics();
