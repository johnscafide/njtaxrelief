from pathlib import Path
import re

base = Path(__file__).with_name('njw_202_patch_property_landing.py')
source = base.read_text(encoding='utf-8')

source = source.replace(
    "'<span id=\"ins-munis\">565</span>', '<span id=\"ins-munis\">564</span>'",
    "'<b>565</b><span>Municipalities</span>', '<b>564</b><span>Municipalities</span>'",
)
source = source.replace(
    "'<span id=\"ins-days\">-</span><small>Days to the appeal deadline</small>',\n    '<span id=\"ins-days\">Apr 1</span><small id=\"ins-days-label\">General appeal deadline</small>'",
    "'<b id=\"ins-days\">-</b><span>Days to the appeal deadline</span>',\n    '<b id=\"ins-days\">227</b><span>Days to general appeal deadline</span>'",
)
source = source.replace(
    "'If it&rsquo;s worth appealing, I&rsquo;ll tell you what it&rsquo;s worth in dollars.',\n    'If it&rsquo;s worth appealing, we&rsquo;ll show you what it&rsquo;s worth in dollars.'",
    '"If it\'s worth appealing, I\'ll tell you what it\'s worth in dollars.",\n    "If it\'s worth appealing, we\'ll show you what it\'s worth in dollars."',
)
source = source.replace(
    "r'<h4>(Why this method\\?\\s*<a[^>]+>Chapter 123</a>)</h4>'",
    "r'<h4>(<i class=\"fas fa-lightbulb\"></i> The number that decides an appeal)</h4>'",
)

# The existing lookup script already recalculates the day count. Keep that logic untouched;
# the source HTML now provides a valid non-dash fallback if lookup JS is delayed or blocked.
source, count = re.subn(
    r"# Static no-JS deadline remains meaningful; live JS switches it to a day count and updates the label\.\nlookup_old = .*?lookup = lookup\.replace\(lookup_old, lookup_new, 1\)\n",
    "",
    source,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError(f'Could not remove lookup mutation block: {count}')

exec(compile(source, str(base), 'exec'), {'__file__': str(base), '__name__': '__main__'})
