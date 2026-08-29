do $$
declare
  changed_rows integer;
begin
  update public.insights_articles
  set body_html = replace(
      replace(
        replace(
          replace(
            body_html,
            '<li><b>Camden County:</b> Lindenwold Borough and Pine Hill Borough.</li>',
            '<li><b><a href="/towns/camden/">Camden County</a>:</b> <a href="/towns/camden/lindenwold-borough.html">Lindenwold Borough</a> and <a href="/towns/camden/pine-hill-borough.html">Pine Hill Borough</a>.</li>'
          ),
          '<li><b>Gloucester County:</b> Clayton Borough, Logan Township, West Deptford Township and Westville Borough.</li>',
          '<li><b><a href="/towns/gloucester/">Gloucester County</a>:</b> <a href="/towns/gloucester/clayton-borough.html">Clayton Borough</a>, <a href="/towns/gloucester/logan-township.html">Logan Township</a>, <a href="/towns/gloucester/west-deptford-township.html">West Deptford Township</a> and <a href="/towns/gloucester/westville-borough.html">Westville Borough</a>.</li>'
        ),
        '<li><b>Salem County:</b> Lower Alloways Creek Township.</li>',
        '<li><b><a href="/towns/salem/">Salem County</a>:</b> <a href="/towns/salem/lower-alloways-creek-township.html">Lower Alloways Creek Township</a>.</li>'
      ),
      'learn the appeal process early.',
      'learn the <a href="/property-tax-appeal.html">appeal process</a> early.'
    ),
    updated_at = now()
  where slug = '2026-revaluation-reassessment-list'
    and published is true
    and body_html like '%<li><b>Camden County:</b> Lindenwold Borough and Pine Hill Borough.</li>%'
    and body_html like '%<li><b>Gloucester County:</b> Clayton Borough, Logan Township, West Deptford Township and Westville Borough.</li>%'
    and body_html like '%<li><b>Salem County:</b> Lower Alloways Creek Township.</li>%'
    and body_html like '%learn the appeal process early.%'
    and body_html not like '%/towns/camden/lindenwold-borough.html%';

  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then
    raise exception 'Expected exactly one current 2026 revaluation insight row; updated %', changed_rows;
  end if;

  update public.insights_articles
  set body_html = replace(
      replace(
        replace(
          replace(
            body_html,
            '<p>Camden and Gloucester counties are a useful example.',
            '<p><a href="/towns/camden/">Camden County</a> and <a href="/towns/gloucester/">Gloucester County</a> are a useful example.'
          ),
          'official 2026 revaluation and reassessment list',
          '<a href="/insights/2026-revaluation-reassessment-list">official 2026 revaluation and reassessment list</a>'
        ),
        '<b>four Gloucester County municipalities</b> on it: Clayton, Logan, West Deptford and Westville.',
        '<b>four <a href="/towns/gloucester/">Gloucester County</a> municipalities</b> on it: <a href="/towns/gloucester/clayton-borough.html">Clayton</a>, <a href="/towns/gloucester/logan-township.html">Logan</a>, <a href="/towns/gloucester/west-deptford-township.html">West Deptford</a> and <a href="/towns/gloucester/westville-borough.html">Westville</a>.'
      ),
      '<p>Watchdog tracks a concept that is easy to miss when looking at real estate headlines: your assessed value is not always supposed to equal today’s sale price.</p>',
      '<p>Watchdog tracks a concept that is easy to miss when looking at real estate headlines: your assessed value is not always supposed to equal today’s sale price. <a href="/insights/equalization-ratios">See how New Jersey equalization ratios work.</a></p>'
    ),
    updated_at = now()
  where slug = 'south-jersey-housing-market-summer-2026'
    and published is true
    and body_html like '%<p>Camden and Gloucester counties are a useful example.%'
    and body_html like '%official 2026 revaluation and reassessment list%'
    and body_html like '%<b>four Gloucester County municipalities</b> on it: Clayton, Logan, West Deptford and Westville.%'
    and body_html like '%Watchdog tracks a concept that is easy to miss when looking at real estate headlines:%'
    and body_html not like '%/towns/gloucester/west-deptford-township.html%';

  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then
    raise exception 'Expected exactly one current South Jersey housing insight row; updated %', changed_rows;
  end if;
end $$;
