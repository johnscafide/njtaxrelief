from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "property" / "index.html"
LOOKUP = ROOT / "property" / "js" / "lookup.js"

html = INDEX.read_text(encoding="utf-8")
lookup = LOOKUP.read_text(encoding="utf-8")

if "/property/css/landing-review.css" in html:
    print("NJW-202 landing patch already applied")
    raise SystemExit(0)


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)

# Stable CSS asset, no query-string cache busting.
html = replace_once(
    html,
    '  <link rel="stylesheet" href="/property/css/public-mobile-nav.css">',
    '  <link rel="stylesheet" href="/property/css/public-mobile-nav.css">\n  <link rel="stylesheet" href="/property/css/landing-review.css">',
    "landing review stylesheet",
)

# Accuracy + brand voice fixes.
html = replace_once(html, '<span id="ins-munis">565</span>', '<span id="ins-munis">564</span>', "municipality count")
html = replace_once(
    html,
    '<span id="ins-days">-</span><small>Days to the appeal deadline</small>',
    '<span id="ins-days">Apr 1</span><small id="ins-days-label">General appeal deadline</small>',
    "appeal deadline fallback",
)
html = replace_once(
    html,
    'If it&rsquo;s worth appealing, I&rsquo;ll tell you what it&rsquo;s worth in dollars.',
    'If it&rsquo;s worth appealing, we&rsquo;ll show you what it&rsquo;s worth in dollars.',
    "Watchdog voice",
)
html = replace_once(
    html,
    'Most agents can tell you what your home is worth. We also read the assessment, because one of us has spent 15 plus years preparing New Jersey tax returns.',
    'Most agents can tell you what your home is worth. We also read the assessment and bring more than 15 years of New Jersey tax-return preparation experience to the conversation.',
    "agent tax experience wording",
)
html = html.replace('<!-- <h2 class="lp-h2">How it works</h2> -->', '<h2 class="lp-h2">How it works</h2>', 1)

# Promote the Chapter 123 teaching block to a real subheading without changing its copy.
html, h3_count = re.subn(
    r'<h4>(Why this method\?\s*<a[^>]+>Chapter 123</a>)</h4>',
    r'<h3>\1</h3>',
    html,
    count=1,
)
if h3_count != 1:
    raise RuntimeError(f"Chapter 123 heading: expected 1 replacement, found {h3_count}")

# Compact source proof directly beneath the hero.
proof = '''\n\n<section class="lp-proof-strip" aria-label="New Jersey property data coverage and sources">\n  <div class="lp-proof-inner">\n    <div class="lp-proof-stat"><strong>564</strong><span>NJ municipalities</span></div>\n    <div class="lp-proof-stat"><strong>131,244</strong><span>SR1A verified sales on file</span></div>\n    <div class="lp-proof-stat"><strong>55.2%</strong><span>Statewide median assessment ratio</span></div>\n    <div class="lp-proof-source"><span>Built from New Jersey public records, including Division of Taxation sales and equalization data.</span><a href="/property/data-methodology">See the methodology <i class="fas fa-arrow-right"></i></a></div>\n  </div>\n</section>'''

start = html.find('<div class="pl-hero">')
if start < 0:
    raise RuntimeError("Hero start not found")
tag_re = re.compile(r'<div\b[^>]*>|</div>', re.I)
depth = 0
hero_end = None
for match in tag_re.finditer(html, start):
    tag = match.group(0).lower()
    if tag.startswith('<div'):
        depth += 1
    else:
        depth -= 1
        if depth == 0:
            hero_end = match.end()
            break
if hero_end is None:
    raise RuntimeError("Hero closing div not found")
html = html[:hero_end] + proof + html[hero_end:]

# Make the FAQPage schema true in the visible document. Copy stays aligned with JSON-LD.
faq = '''<!-- FAQ TEASER -->\n<section class="landing-faq" aria-labelledby="landing-faq-title">\n  <h2 id="landing-faq-title">Common questions</h2>\n  <p class="landing-faq-intro">Quick answers to the questions people ask most about New Jersey property records, assessments and appeals.</p>\n  <div class="landing-faq-grid">\n    <details class="landing-faq-item">\n      <summary>Where does this property tax data come from?</summary>\n      <p>It comes from the New Jersey Office of GIS statewide parcel layer, joined to the Division of Taxation MOD-IV assessment records. MOD-IV is the same system municipal tax assessors use. The data is refreshed once a year, typically in late spring or early summer.</p>\n    </details>\n    <details class="landing-faq-item">\n      <summary>Does this show whether a home is for sale?</summary>\n      <p>No. Live listing status in New Jersey comes from the MLS, which is a licensed feed and not public data. This tool reads public assessment records only. It can show when a deed was recorded recently, meaning the property changed hands, but it cannot tell you whether a home is currently listed for sale. For that, contact a licensed agent with MLS access.</p>\n    </details>\n    <details class="landing-faq-item">\n      <summary>Why is the owner name blank?</summary>\n      <p>Owner names are removed from the public version of this data under Daniel's Law, New Jersey legislation restricting public disclosure of certain personal information. Property details and tax figures remain public.</p>\n    </details>\n    <details class="landing-faq-item">\n      <summary>Is the tax amount shown my current bill?</summary>\n      <p>No. The figure shown is the prior year billed amount from the most recent published assessment file. Your current year bill will differ because municipal tax rates are set annually. Use it as a reliable ballpark, not an exact current figure.</p>\n    </details>\n    <details class="landing-faq-item">\n      <summary>What is the difference between assessed value and market value in New Jersey?</summary>\n      <p>Assessed value is the figure your municipality uses to calculate your tax bill. Market value is what the home would sell for today. They are linked by the municipal equalization ratio. Dividing your assessment by that ratio gives the market value your town is implying. If your home would realistically sell for less than that number, you may have grounds for a tax appeal.</p>\n    </details>\n    <details class="landing-faq-item">\n      <summary>Can I appeal my New Jersey property tax assessment?</summary>\n      <p>Yes. New Jersey property owners can appeal their assessment to the county board of taxation, generally by April 1, or by May 1 in a municipality that went through a revaluation or reassessment. Under the Chapter 123 rule an assessment is upheld if it falls within 15 percent above the ratio applied to true market value, so an appeal succeeds when credible comparable sales place market value meaningfully below what the assessment implies.</p>\n    </details>\n    <details class="landing-faq-item">\n      <summary>Who pays the realty transfer fee when selling a home in New Jersey?</summary>\n      <p>The seller pays the general realty transfer fee at closing, calculated on a graduated schedule based on the sale price. For contracts fully executed on or after July 10, 2025, residential sales over one million dollars also carry a graduated percent fee that is now paid by the seller rather than the buyer, and it applies to the entire sale price rather than only the amount above one million. Sellers who are 62 or older, blind, or permanently disabled may qualify for a partial exemption using Form RTF-1.</p>\n    </details>\n    <details class="landing-faq-item">\n      <summary>What are block and lot numbers?</summary>\n      <p>Block and lot are how New Jersey municipalities identify individual parcels of land on the official tax map. They are needed for tax appeals, deed searches, permit applications, and title work. A qualifier code is added for condominium units and certain subdivided properties.</p>\n    </details>\n  </div>\n  <p class="landing-faq-more">Looking for ANCHOR, Stay NJ or more detailed property-record answers? <a href="/property/faq.html">Read the full FAQ <i class="fas fa-arrow-right"></i></a></p>\n</section>'''
html, faq_count = re.subn(r'<!-- FAQ TEASER -->.*?</section>', faq, html, count=1, flags=re.S)
if faq_count != 1:
    raise RuntimeError(f"FAQ section: expected 1 replacement, found {faq_count}")

# Keep time-sensitive community posts from taking the landing-page lead slot.
housing_lead = '''<a class="ins-lead" href="/property/insights/south-jersey-housing-market-summer-2026.html" aria-label="Read the South Jersey housing market Insight">\n        <div class="ins-photo" style="background-image:url('https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1800&q=82')"></div>\n        <span class="ins-kicker">Housing Market</span>\n        <h3>South Jersey home prices are still rising, but the market is starting to look different</h3>\n        <p>Prices remain elevated, but the pace, inventory and negotiating environment are changing. See the South Jersey signals homeowners, buyers and sellers should be watching.</p>\n        <em>Read Insight</em>\n      </a>'''
html, lead_count = re.subn(
    r'<a class="ins-lead" href="/property/insights/south-jersey-weekend-events-august-15-16-2026\.html".*?</a>',
    housing_lead,
    html,
    count=1,
    flags=re.S,
)
if lead_count != 1:
    raise RuntimeError(f"Insight lead: expected 1 replacement, found {lead_count}")
html, list_count = re.subn(
    r'\s*<a href="/property/insights/south-jersey-housing-market-summer-2026\.html">.*?</a>',
    '',
    html,
    count=1,
    flags=re.S,
)
if list_count != 1:
    raise RuntimeError(f"Duplicate housing insight list item: expected 1 removal, found {list_count}")

# Static no-JS deadline remains meaningful; live JS switches it to a day count and updates the label.
lookup_old = "insDays.textContent=String(diff);"
lookup_new = "insDays.textContent=String(diff); const insDaysLabel=document.querySelector('#ins-days-label'); if(insDaysLabel) insDaysLabel.textContent='Days to general appeal deadline';"
if lookup_old not in lookup:
    raise RuntimeError("lookup deadline assignment not found")
lookup = lookup.replace(lookup_old, lookup_new, 1)

INDEX.write_text(html, encoding="utf-8")
LOOKUP.write_text(lookup, encoding="utf-8")

# Fail loudly if the old public municipality count remains in property-facing HTML/JS.
stale = []
for pattern in ("*.html", "*.js"):
    for path in (ROOT / "property").rglob(pattern):
        text = path.read_text(encoding="utf-8", errors="ignore")
        if ">565<" in text or "565 Municipalities" in text:
            stale.append(str(path.relative_to(ROOT)))
if stale:
    raise RuntimeError("Stale 565 municipality count remains in: " + ", ".join(sorted(set(stale))))

print("NJW-202 property landing patch applied successfully")
