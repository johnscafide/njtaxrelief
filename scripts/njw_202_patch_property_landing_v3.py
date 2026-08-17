from pathlib import Path

base = Path(__file__).with_name('njw_202_patch_property_landing.py')
source = base.read_text(encoding='utf-8')

# Current landing markup uses bare <b> values in the evidence strip.
source = source.replace(
    "'<span id=\"ins-munis\">565</span>', '<span id=\"ins-munis\">564</span>'",
    "'<b>565</b><span>Municipalities</span>', '<b>564</b><span>Municipalities</span>'",
)
source = source.replace(
    "'<span id=\"ins-days\">-</span><small>Days to the appeal deadline</small>',\n    '<span id=\"ins-days\">Apr 1</span><small id=\"ins-days-label\">General appeal deadline</small>'",
    "'<b id=\"ins-days\">-</b><span>Days to the appeal deadline</span>',\n    '<b id=\"ins-days\">Apr 1</b><span id=\"ins-days-label\">General appeal deadline</span>'",
)

# Current source uses literal apostrophes rather than HTML entities here.
source = source.replace(
    "'If it&rsquo;s worth appealing, I&rsquo;ll tell you what it&rsquo;s worth in dollars.',\n    'If it&rsquo;s worth appealing, we&rsquo;ll show you what it&rsquo;s worth in dollars.'",
    '"If it\'s worth appealing, I\'ll tell you what it\'s worth in dollars.",\n    "If it\'s worth appealing, we\'ll show you what it\'s worth in dollars."',
)

# The current methodology callout headline is "The number that decides an appeal".
source = source.replace(
    "r'<h4>(Why this method\\?\\s*<a[^>]+>Chapter 123</a>)</h4>'",
    "r'<h4>(<i class=\"fas fa-lightbulb\"></i> The number that decides an appeal)</h4>'",
)

exec(compile(source, str(base), 'exec'), {'__file__': str(base), '__name__': '__main__'})
