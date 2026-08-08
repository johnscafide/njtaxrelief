create index if not exists publication_sets_release_idx
  on watchdog_warehouse.publication_sets (release_id);

create index if not exists publication_sets_previous_release_idx
  on watchdog_warehouse.publication_sets (previous_release_id)
  where previous_release_id is not null;
