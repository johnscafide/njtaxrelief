#!/usr/bin/env python3
"""Build durable, search-friendly New Jersey municipality report pages from local data.

Run after refreshing the state datasets:
    python scripts/generate_town_pages.py --date 2026-08-06
"""
from __future__ import annotations

import argparse
import html
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOWNS = ROOT / "towns"
SITE = "https://njpropertytaxrelief.com"


def esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def norm(value: object) -> str:
    return re.sub(
        r"\s+",
        " ",
        str(value or "")
        .upper()
        .replace("TOWNSHIP", "TWP")
        .replace("TWNSHP", "TWP")
        .replace("BOROUGH", "BORO"),
    ).strip()


def slug(value: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return text or "new-jersey"


def money(value: object) -> str:
    try:
        return f"${float(value):,.0f}"
    except (TypeError, ValueError):
        return "Not reported"


def rate_map(raw: dict) -> dict[str, list[tuple[int, float]]]:
    output: dict[str, list[tuple[int, float]]] = {}
    for key, values in raw.items():
        pairs = []
        for year, rate in values.items():
            try:
                pairs.append((int(year), float(rate)))
            except (TypeError, ValueError):
                continue
        output[norm(key)] = sorted(pairs)
    return output


def get_rate(
    history: dict[str, list[tuple[int, float]]], name: str, county: str
) -> list[tuple[int, float]]:
    exact = history.get(norm(f"{name} ({county})"))
    if exact:
        return exact
    town_key = norm(name)
    matches = [values for key, values in history.items() if key.startswith(town_key + " (")]
    return matches[0] if len(matches) == 1 else []


def rate_change(series: list[tuple[int, float]]) -> str:
    if len(series) < 2 or series[0][1] <= 0:
        return "Historical comparison unavailable"
    first_year, first = series[0]
    last_year, last = series[-1]
    years = max(1, last_year - first_year)
    annual = ((last / first) ** (1 / years) - 1) * 100
    direction = "increased" if annual >= 0 else "decreased"
    return f"{direction} {abs(annual):.2f}% per year from {first_year} to {last_year}"


def chart(series: list[tuple[int, float]]) -> str:
    if not series:
        return '<p class="tp-muted">A municipal tax-rate series is not available in the current local dataset.</p>'
    recent = series[-5:]
    ceiling = max(rate for _, rate in recent) or 1
    bars = "".join(
        f'<div class="tp-bar-wrap"><div class="tp-bar" style="height:{max(14, int(rate / ceiling * 118))}px" title="{year}: {rate:.3f}%"></div><span>{year}</span><b>{rate:.3f}%</b></div>'
        for year, rate in recent
    )
    return f'<div class="tp-chart" role="img" aria-label="Five-year municipal general tax rate history">{bars}</div>'


def page_head(title: str, description: str, canonical: str, schema: dict, hero: str) -> str:
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(description)}">
  <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1">
  <link rel="canonical" href="{canonical}">
  <meta property="og:type" content="website"><meta property="og:site_name" content="Watchdog Property Intelligence">
  <meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(description)}"><meta property="og:url" content="{canonical}"><meta property="og:image" content="{hero}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://images.unsplash.com"><link rel="preload" as="image" href="{hero}" fetchpriority="high">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Source+Sans+3:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/towns/town-pages.css?v=20260828a">
  <script type="application/ld+json">{json.dumps(schema, separators=(",", ":"))}</script>
</head>'''


def nav() -> str:
    return '''<header class="tp-nav"><a class="tp-brand" href="/property/"><span>Watchdog</span> Property Intelligence</a><nav aria-label="Primary navigation"><a href="/towns/">Town reports</a><a href="/property/">Property lookup</a><a href="/anchor-estimator.html">Benefit estimator</a></nav><a class="tp-nav-cta" href="/property/pro#plans">Professional plans</a></header>'''


def footer() -> str:
    return '''<footer class="tp-footer"><div><b>Watchdog Property Intelligence</b><p>New Jersey property-tax, assessment and public-record context for homeowners and professionals.</p></div><div><a href="/property/">Property lookup</a><a href="/towns/">Town reports</a><a href="/property-tax-appeal.html">Appeal guide</a></div><p class="tp-disclaimer">Municipal data is context, not an appraisal, legal advice, or a determination of benefit eligibility. Watchdog is not a municipal assessor or tax-collector office. Confirm official records, deadlines and filings with the appropriate public agency.</p></footer>'''


def make_schema(
    name: str,
    county: str,
    canonical: str,
    description: str,
    modified: str,
    faq: list[tuple[str, str]],
) -> dict:
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebPage",
                "@id": canonical,
                "url": canonical,
                "name": f"{name}, {county} County NJ Property Taxes, Assessments & Records",
                "description": description,
                "dateModified": modified,
                "inLanguage": "en-US",
                "isPartOf": {
                    "@type": "WebSite",
                    "name": "Watchdog Property Intelligence",
                    "url": SITE,
                },
            },
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
                    {"@type": "ListItem", "position": 2, "name": "Town reports", "item": SITE + "/towns/"},
                    {"@type": "ListItem", "position": 3, "name": f"{county} County", "item": canonical.rsplit("/", 1)[0] + "/"},
                    {"@type": "ListItem", "position": 4, "name": name, "item": canonical},
                ],
            },
            {
                "@type": "FAQPage",
                "mainEntity": [
                    {
                        "@type": "Question",
                        "name": q,
                        "acceptedAnswer": {"@type": "Answer", "text": a},
                    }
                    for q, a in faq
                ],
            },
        ],
    }


def town_page(
    row: dict,
    uniformity: dict,
    pilot: dict,
    rates: dict,
    modified: str,
    hero: str,
    path: str,
) -> str:
    name, county, district = row["name"], row["county"], row["district"]
    series = get_rate(rates, name, county)
    current_year, current_rate = series[-1] if series else (None, None)
    uni = uniformity.get(district, {})
    current_score = uni.get("score")
    coefficient = uni.get("coefficient")
    pilot_row = pilot.get(district, {})
    canonical = SITE + "/" + path
    county_href = f"/towns/{slug(county)}/"
    rate_text = f"{current_rate:.3f}%" if current_rate is not None else "the latest available municipal rate"
    description = (
        f"{name}, {county} County NJ property taxes, assessments and property-record context. "
        f"See {current_year or 'current'} municipal rate data, assessment signals, relief links and Watchdog property lookup tools."
    )
    faqs = [
        (
            f"How are property taxes calculated in {name}?",
            f"A New Jersey property-tax bill starts with a local assessment and the municipality's combined tax rate. This page shows municipal context for {name}; a parcel's bill also depends on its assessment and applicable programs.",
        ),
        (
            f"Where can I look up a {name} property assessment or tax record?",
            f"Use Watchdog's New Jersey property lookup for parcel-level assessment, prior tax-bill, block and lot context, then confirm any official filing or current balance with the appropriate {name} or county public office.",
        ),
        (
            f"What relief programs can {name} residents explore?",
            "Residents may be eligible for state programs such as ANCHOR, Senior Freeze, or property-tax deductions. Eligibility, income rules, and filing dates are set by the State, so use the estimator and confirm current rules before filing.",
        ),
        (
            f"Can a {name} assessment be appealed?",
            "An assessment appeal is fact-specific and generally relies on timely filing and credible comparable-sales evidence. The appeal guide and Watchdog research tools can help organize the municipal record; official boards decide outcomes.",
        ),
        (
            f"Where does this {name} data come from?",
            "The figures are compiled from local copies of New Jersey public municipal datasets, including levy-rate history and assessment-consistency releases. Source links and the reporting year are shown on this page.",
        ),
    ]
    faq_html = "".join(
        f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in faqs
    )
    rate_stat = f"{current_rate:.3f}%" if current_rate is not None else "—"
    rate_sub = f"{current_year} municipal rate" if current_year else "public rate pending"
    consistency = f"{float(current_score):.1f}/100" if current_score is not None else "—"
    consistency_sub = "assessment consistency" if current_score is not None else "not in current release"
    budget_score = row.get("score")
    budget_stat = f"{float(budget_score):.0f}/100" if budget_score is not None else "—"
    budget_sub = f"{row.get('band', 'municipal')} budget pressure"
    exempt_share = pilot_row.get("exempt_share")
    exempt_stat = f"{float(exempt_share) * 100:.1f}%" if isinstance(exempt_share, (int, float)) else "—"
    exempt_sub = "exempt assessed value share" if exempt_stat != "—" else "not in current release"
    tax_base = (row.get("history") or [{}])[-1].get("tax_base")
    assessment_note = (
        f"The reported assessment consistency score is {float(current_score):.1f} out of 100. "
        if current_score is not None
        else "An assessment consistency score is not available in the current statewide release. "
    )
    if coefficient is not None:
        assessment_note += (
            f"The reported coefficient is {float(coefficient):.2f}; this is a municipal consistency measure, "
            "not an opinion of a specific property's value."
        )
    pilot_note = (
        f"{float(exempt_share) * 100:.1f}% of assessed value is listed as exempt in the local release, with {pilot_row.get('pilot_count', 0)} PILOT agreements reported."
        if isinstance(exempt_share, (int, float))
        else "The exempt-value and PILOT detail is not available in the current local release."
    )
    schema = make_schema(name, county, canonical, description, modified, faqs)
    title = f"{name} NJ Property Taxes, Assessments & Records | Watchdog"
    return page_head(title, description, canonical, schema, hero) + f'''<body>
{nav()}
<main>
  <section class="tp-hero" style="--town-hero:url('{hero}')"><div class="tp-hero-shade"></div><div class="tp-wrap tp-hero-content"><p class="tp-eyebrow">{esc(county)} County property intelligence</p><h1>{esc(name)} property taxes, assessments &amp; records</h1><p class="tp-lead">Municipal tax context, assessment signals and public-record research for {esc(name)}, with a direct path into parcel-level Watchdog lookup.</p><div class="tp-actions"><a class="tp-button" href="/property/">Look up a property</a><a class="tp-button tp-button-quiet" href="/property/town-compare?towns={esc(district)}">Compare this town</a></div><p class="tp-source">Municipality code {esc(district)} · refreshed {esc(modified)}</p></div></section>
  <section class="tp-wrap tp-stats" aria-label="{esc(name)} municipal metrics"><article><b>{rate_stat}</b><span>{rate_sub}</span></article><article><b>{consistency}</b><span>{consistency_sub}</span></article><article><b>{budget_stat}</b><span>{esc(budget_sub)}</span></article><article><b>{exempt_stat}</b><span>{exempt_sub}</span></article></section>
  <section class="tp-wrap tp-layout"><div class="tp-main">
    <section class="tp-section"><p class="tp-kicker">At a glance</p><h2>What the {esc(name)} municipal record shows</h2><p><b>{esc(name)}</b> is in <a href="{county_href}">{esc(county)} County</a>. The latest local general tax rate in this dataset is <b>{rate_text}</b>. The municipal tax base reported for the latest budget series is <b>{money(tax_base)}</b>.</p><div class="tp-callout"><b>Plain-English read</b><p>{assessment_note}</p></div></section>
    <section class="tp-section"><p class="tp-kicker">Property tax &amp; records</p><h2>{esc(name)} property tax, assessment and record lookup</h2><p>Use this page for municipality-level context, then open Watchdog for a specific New Jersey address. Parcel lookup can return the assessed value, prior published tax bill, block and lot, tax history and other governed public-record context when available.</p><div class="tp-signal-grid"><article><h3>Look up a property</h3><p>Search by address to move from {esc(name)}-wide context to the parcel record. Watchdog is not the municipal tax collector and does not represent a current balance due.</p><a href="/property/">Search {esc(name)} property records →</a></article><article><h3>Understand the county context</h3><p>Compare {esc(name)} with the other municipalities in {esc(county)} County without creating duplicate assessor or tax-record pages for the same place.</p><a href="{county_href}">Open {esc(county)} County property-tax reports →</a></article></div></section>
    <section class="tp-section"><p class="tp-kicker">Rate context</p><h2>{esc(name)} property-tax rate history</h2><p>The local general rate has {esc(rate_change(series))}. Rate history provides municipal context; it does not predict an individual home's future tax bill.</p>{chart(series)}<p class="tp-source">Source: NJ Division of Taxation municipal tax-rate history, local copy through {esc(str(current_year) if current_year else 'the latest available year')}.</p></section>
    <section class="tp-section"><p class="tp-kicker">Assessment &amp; public-finance signals</p><h2>Two things worth separating</h2><div class="tp-signal-grid"><article><h3>Assessment consistency</h3><p>{assessment_note}</p><a href="/property/fairness?district={esc(district)}">Open the Watchdog assessment tool →</a></article><article><h3>Exempt property &amp; PILOT context</h3><p>{pilot_note}</p><a href="/property/exempt-pilot?district={esc(district)}">Review municipal context →</a></article></div></section>
    <section class="tp-watchdog"><p class="tp-kicker">Watchdog Property Intelligence</p><h2>Turn municipal context into property-level research</h2><p>Watchdog brings the public record together with property lookup, saved properties, verified-sale research, comparisons, appeal screening and professional workflows.</p><div class="tp-actions"><a class="tp-button" href="/property/">Look up a property</a><a class="tp-text-link" href="/property/pro#plans">Explore professional plans</a></div></section>
    <section class="tp-section tp-faq"><p class="tp-kicker">Answers</p><h2>{esc(name)} property-tax and assessment questions</h2>{faq_html}</section>
  </div><aside class="tp-aside"><section class="tp-side-card"><p class="tp-kicker">Start here</p><h2>Research the property, then the next step</h2><a href="/property/">Search a property with Watchdog</a><a href="/anchor-estimator.html">Estimate NJ property-tax benefits</a><a href="/property-tax-appeal.html">Understand the appeal process</a><a href="{county_href}">{esc(county)} County reports</a></section><section class="tp-agent"><img src="/johnprofile.jpg" alt="New Jersey real-estate professional" loading="lazy"><div><b>Need local help?</b><p>Talk with a New Jersey real-estate professional about the next practical step.</p><a href="/contact.html">Contact an agent →</a></div></section><p class="tp-method">Data sources: <a href="https://www.nj.gov/treasury/taxation/lpt/statdata.shtml" rel="nofollow">NJ Division of Taxation</a>, municipal assessment releases, and local reporting files. <a href="/property/data-methodology">Methodology</a>.</p></aside></section>
</main>{footer()}</body></html>'''


def county_page(county: str, towns: list[dict], modified: str) -> str:
    county_slug = slug(county)
    canonical = f"{SITE}/towns/{county_slug}/"
    title = f"{county} County NJ Property Tax Records & Assessments | Watchdog"
    desc = (
        f"Browse {len(towns)} {county} County NJ municipal property-tax, assessment and record reports. "
        "Compare rate context, assessment signals and open Watchdog property lookup."
    )
    cards = "".join(
        f'<a class="tp-town-card" href="/{esc(t["path"])}"><span>{esc(t["name"])}</span><small>{esc(t["rate_label"])}</small><b>Open report →</b></a>'
        for t in towns
    )
    schema = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": title,
        "url": canonical,
        "description": desc,
        "dateModified": modified,
    }
    hero = "https://images.unsplash.com/photo-1505843795480-5cfb3c03f6ff?auto=format&fit=crop&w=1800&q=85"
    return page_head(title, desc, canonical, schema, hero) + f'''<body>{nav()}<main><section class="tp-directory-hero"><div class="tp-wrap"><p class="tp-eyebrow">New Jersey county property intelligence</p><h1>{esc(county)} County property taxes, assessments &amp; records</h1><p>{esc(desc)}</p><div class="tp-actions"><a class="tp-button" href="/property/">Look up a property</a><a class="tp-button tp-button-outline" href="/towns/">All NJ towns</a></div></div></section><section class="tp-wrap tp-directory"><p class="tp-kicker">{len(towns)} municipalities</p><p class="tp-method">Choose the municipality that owns the assessment record. Watchdog provides research context; official assessor, collector and county offices remain the source for filings and current balances.</p><div class="tp-town-grid">{cards}</div></section></main>{footer()}</body></html>'''


def directory_page(counties: dict[str, list[dict]], modified: str) -> str:
    canonical = f"{SITE}/towns/"
    total = sum(len(v) for v in counties.values())
    title = "New Jersey Property Taxes, Assessments & Records by Town | Watchdog"
    desc = (
        f"Browse {total} New Jersey municipal property-tax and assessment reports. "
        "Find rate history, public-record context and Watchdog property lookup by town."
    )
    groups = "".join(
        f'<section class="tp-county-group"><h2><a href="/towns/{slug(county)}/">{esc(county)} County</a></h2><div class="tp-town-grid">'
        + "".join(
            f'<a class="tp-town-card" href="/{esc(t["path"])}"><span>{esc(t["name"])}</span><small>{esc(t["rate_label"])}</small><b>Open report →</b></a>'
            for t in towns
        )
        + "</div></section>"
        for county, towns in sorted(counties.items())
    )
    schema = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": title,
        "url": canonical,
        "description": desc,
        "dateModified": modified,
    }
    hero = "https://images.unsplash.com/photo-1505843795480-5cfb3c03f6ff?auto=format&fit=crop&w=1800&q=85"
    return page_head(title, desc, canonical, schema, hero) + f'''<body>{nav()}<main><section class="tp-directory-hero"><div class="tp-wrap"><p class="tp-eyebrow">New Jersey property intelligence</p><h1>Find property-tax and assessment context by town</h1><p>{esc(desc)}</p><label class="tp-search"><span>Search all town reports</span><input id="townSearch" type="search" placeholder="Try Allendale, Camden, or Clifton" autocomplete="off"></label><div class="tp-actions"><a class="tp-button" href="/property/">Look up a property</a></div></div></section><section class="tp-wrap tp-directory"><p class="tp-kicker">{total} municipal reports · {len(counties)} counties</p>{groups}</section></main>{footer()}<script>const i=document.getElementById('townSearch');i.addEventListener('input',()=>{{const q=i.value.toLowerCase().trim();document.querySelectorAll('.tp-town-card').forEach(c=>c.hidden=!!q&&!c.textContent.toLowerCase().includes(q));document.querySelectorAll('.tp-county-group').forEach(g=>g.hidden=!!q&&![...g.querySelectorAll('.tp-town-card')].some(c=>!c.hidden));}});</script></body></html>'''


def update_sitemap(paths: list[str], modified: str) -> None:
    file = ROOT / "sitemap.xml"
    content = file.read_text(encoding="utf-8")
    records = []
    for path in paths:
        priority = "0.75" if path == "towns/" else ("0.60" if path.endswith("/index.html") else "0.66")
        freq = "monthly" if path == "towns/" or path.endswith("/index.html") else "yearly"
        records.append(
            f"  <url><loc>{SITE}/{path}</loc><lastmod>{modified}</lastmod><changefreq>{freq}</changefreq><priority>{priority}</priority></url>"
        )
    block = "<!-- TOWN_REPORTS_START -->\n" + "\n".join(records) + "\n<!-- TOWN_REPORTS_END -->"
    if "<!-- TOWN_REPORTS_START -->" in content:
        content = re.sub(
            r"<!-- TOWN_REPORTS_START -->.*?<!-- TOWN_REPORTS_END -->",
            block,
            content,
            flags=re.S,
        )
    else:
        content = content.replace("</urlset>", block + "\n</urlset>")
    file.write_text(content, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=date.today().isoformat(), dest="modified")
    args = parser.parse_args()
    budget = list(
        json.loads((ROOT / "property/data/budget-pressure.json").read_text())["municipalities"].values()
    )
    uniformity = json.loads((ROOT / "property/uniformity.json").read_text())["districts"]
    pilot = json.loads((ROOT / "property/data/exempt-pilot.json").read_text())["municipalities"]
    rates = rate_map(json.loads((ROOT / "property/tax-rates.json").read_text())["rates"])
    if len(budget) != 564:
        raise SystemExit(f"Expected 564 municipality records; got {len(budget)}")
    TOWNS.mkdir(exist_ok=True)
    hero_images = [
        "https://images.unsplash.com/photo-1505843795480-5cfb3c03f6ff?auto=format&fit=crop&w=1800&q=85",
        "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1800&q=85",
        "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1800&q=85",
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1800&q=85",
    ]
    counties: dict[str, list[dict]] = {}
    paths: list[str] = ["towns/"]
    manifest = []
    seen: set[str] = set()
    for index, row in enumerate(sorted(budget, key=lambda x: (x["county"], x["name"]))):
        county_slug, town_slug = slug(row["county"]), slug(row["name"])
        path = f"towns/{county_slug}/{town_slug}.html"
        if path in seen:
            path = f"towns/{county_slug}/{town_slug}-{row['district']}.html"
        seen.add(path)
        target = ROOT / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            town_page(
                row,
                uniformity,
                pilot,
                rates,
                args.modified,
                hero_images[index % len(hero_images)],
                path,
            ),
            encoding="utf-8",
        )
        series = get_rate(rates, row["name"], row["county"])
        label = f"{series[-1][1]:.3f}% · {series[-1][0]} rate" if series else "Municipal report"
        record = {
            "district": row["district"],
            "name": row["name"],
            "county": row["county"],
            "path": path,
            "rate_label": label,
        }
        counties.setdefault(row["county"], []).append(record)
        manifest.append(record)
        paths.append(path)
    for county, towns in counties.items():
        towns.sort(key=lambda x: x["name"])
        path = f"towns/{slug(county)}/index.html"
        (ROOT / path).write_text(county_page(county, towns, args.modified), encoding="utf-8")
        paths.append(path)
    (TOWNS / "index.html").write_text(directory_page(counties, args.modified), encoding="utf-8")
    (TOWNS / "town-manifest.json").write_text(
        json.dumps(
            {
                "generated_at": args.modified,
                "total_towns": len(manifest),
                "counties": len(counties),
                "pages": manifest,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    update_sitemap(paths, args.modified)
    print(
        json.dumps(
            {
                "town_pages": len(manifest),
                "county_hubs": len(counties),
                "sitemap_urls": len(paths),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
